import { NextRequest, NextResponse } from "next/server";

type Body = {
  slideHtml: string;
  instruction: string;
  direction?: string;
  model?: string;
  images?: { src: string; alt?: string; prompt?: string }[];
};

export async function POST(req: NextRequest) {
  try {
    const { slideHtml, instruction, direction, model, images = [] }: Body = await req.json();
    if (!slideHtml || !instruction) {
      return NextResponse.json({ error: "Missing slideHtml or instruction" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set on server" }, { status: 500 });
    }

    const system = `
You will receive one slide's HTML and an instruction. Edit the slide accordingly and respond ONLY with this JSON (no code fences):

type SlideResponse = { html: string };

Rules:
- Keep tags limited to h1, h2, h3, p, strong, em, div, span
- No inline styles. Allowed classes: "highlight", "cta", "image-placeholder", "ai-image"
- For AI images, keep <div class="ai-image" data-prompt="..." data-width="1080" data-height="1080"></div>; do not embed base64/URLs
- Do not add slide separators
- Keep wording concise, wrap naturally, avoid type tokens like string/number/boolean
`;

    const parts: any[] = [];
    if (direction) parts.push({ type: "text", text: `Direction: ${direction}` });
    parts.push({ type: "text", text: `Instruction: ${instruction}` });
    parts.push({ type: "text", text: `Current slide HTML:` });
    parts.push({ type: "text", text: slideHtml });
    if (Array.isArray(images) && images.length) {
      parts.push({ type: "text", text: `\nImage context (${images.length}):` });
      images.forEach((img, i) => {
        const caption = `Image ${i + 1}${img.prompt ? ` (prompt: ${img.prompt})` : ""}${
          img.alt ? ` (alt: ${img.alt})` : ""
        }`;
        parts.push({ type: "text", text: caption });
        parts.push({ type: "image_url", image_url: { url: img.src } });
      });
    }

    console.log(parts);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || "openai/gpt-5-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: parts },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${errText}` }, { status: 502 });
    }

    const data = (await response.json()) as any;
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: "No content" }, { status: 502 });

    type SlideResponse = { html: string };
    let parsed: SlideResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "Non-JSON content" }, { status: 502 });
    }

    const allowed = new Set(["highlight", "cta", "image-placeholder", "ai-image"]);
    function sanitize(html: string) {
      let out = String(html || "")
        .replace(/```[a-zA-Z]*\n?|```/g, "")
        .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*(script|style)\s*>/gi, "")
        .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
      out = out.replace(/class\s*=\s*"([^"]*)"/gi, (_m, cls: string) => {
        const filtered = cls
          .split(/\s+/)
          .filter((c: string) => allowed.has(c))
          .join(" ");
        return filtered ? `class="${filtered}"` : "";
      });
      return out.trim();
    }

    const html = sanitize(parsed.html);
    if (!html) return NextResponse.json({ error: "Empty edited slide" }, { status: 502 });
    return NextResponse.json({ html });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
