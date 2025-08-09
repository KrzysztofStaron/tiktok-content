import { NextRequest, NextResponse } from "next/server";

// Server-side image generation proxy with prompt-keyed caching
// Uses Pollinations for demo purposes. Swap to your preferred provider later.

type Body = {
  prompt: string;
  width?: number;
  height?: number;
  cache?: boolean;
};

type CacheEntry = { dataUrl: string; ts: number };
const imageCache: Map<string, CacheEntry> = new Map();
const inFlight: Map<string, Promise<string>> = new Map();
const MAX_ENTRIES = 200; // simple LRU cap
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cacheKey(prompt: string, width: number, height: number): string {
  return `${prompt}__${width}x${height}`;
}

function getFresh(key: string): string | undefined {
  const entry = imageCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > TTL_MS) {
    imageCache.delete(key);
    return undefined;
  }
  // bump recency (LRU)
  imageCache.delete(key);
  imageCache.set(key, { ...entry, ts: Date.now() });
  return entry.dataUrl;
}

function setCache(key: string, dataUrl: string) {
  imageCache.set(key, { dataUrl, ts: Date.now() });
  // prune naive LRU
  if (imageCache.size > MAX_ENTRIES) {
    const oldestKey = [...imageCache.entries()].reduce((oldKey, [k, v], idx, arr) => {
      if (!oldKey) return k;
      return imageCache.get(k)!.ts < imageCache.get(oldKey)!.ts ? k : oldKey;
    }, "");
    if (oldestKey) imageCache.delete(oldestKey);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024, cache = true }: Body = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const key = cacheKey(prompt, Math.floor(width), Math.floor(height));

    if (cache) {
      const cached = getFresh(key);
      if (cached) return NextResponse.json({ dataUrl: cached, cached: true });
    }

    let promise = inFlight.get(key);
    if (!promise) {
      // Pollinations endpoint (no key needed). Replace with your provider as needed.
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${Math.floor(
        width
      )}&height=${Math.floor(height)}&n=1`;

      promise = (async () => {
        // Leverage Next.js Data Cache with revalidation + tags
        // See: https://nextjs.org/docs/app/guides/caching
        const r = await fetch(url, { next: { revalidate: TTL_MS / 1000, tags: ["img:", key] } });
        if (!r.ok) {
          const text = await r.text();
          throw new Error(text || "Image API error");
        }
        const buf = Buffer.from(await r.arrayBuffer());
        const dataUrl = `data:image/jpeg;base64,${buf.toString("base64")}`;
        if (cache) setCache(key, dataUrl);
        return dataUrl;
      })();
      inFlight.set(key, promise);
    }

    try {
      const dataUrl = await promise;
      return NextResponse.json({ dataUrl, cached: false });
    } finally {
      inFlight.delete(key);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
