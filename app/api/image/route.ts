import { NextRequest, NextResponse } from "next/server";

// Simple server-side image generation proxy that returns a data URL
// Uses Pollinations for demo purposes. Swap to your preferred provider later.

export const dynamic = "force-dynamic";

type Body = {
  prompt: string;
  width?: number;
  height?: number;
};

export async function POST(req: NextRequest) {
  try {
    const { prompt, width = 1024, height = 1024 }: Body = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Pollinations endpoint (no key needed). Replace with your provider as needed.
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${Math.floor(
      width
    )}&height=${Math.floor(height)}&n=1`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      return NextResponse.json({ error: `Image API error: ${text}` }, { status: 502 });
    }

    const buf = Buffer.from(await r.arrayBuffer());
    const base64 = buf.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64}`;
    return NextResponse.json({ dataUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
