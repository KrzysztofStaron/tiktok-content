import { NextRequest, NextResponse } from "next/server";

type ImproveBody = {
  slides: string[];
  images?: { slideIndex: number; src: string; alt?: string; prompt?: string }[];
  direction?: string;
  model?: string;
  prompt?: string;
  slideCount?: number;
};

export async function POST(req: NextRequest) {
  try {
    const { slides, images = [], direction, model, prompt, slideCount }: ImproveBody = await req.json();

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: "Missing slides" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set on server" }, { status: 500 });
    }

    const desiredCount = Math.min(
      10,
      Math.max(1, Number.isFinite(slideCount as number) ? (slideCount as number) : slides.length || 2)
    );

    const system = `
You will receive the current slide HTML and small preview images that were rendered from earlier AI prompts. Improve the slides while respecting the constraints below. Respond ONLY with a JSON object of this TypeScript type (no code fences). You must return exactly ${desiredCount} slides:

type SlidesResponse = {
  slides: { html: string }[]; // same length as input slides (or 2 if unspecified)
};

Rules for slides[i].html:
- Use only minimal, semantic HTML with these tags: h1, h2, h3, p, strong, em, div, span
- No inline styles. No arbitrary attributes.
- Emphasis: <strong> for bold, <em> for italics
- Special text: <span class="highlight">…</span> and <span class="cta">…</span>
- Images: Use <div class="ai-image" data-prompt="..." data-width="1080" data-height="1080"></div> as the placeholder only; do not embed base64 or URLs in output
- Do NOT include any slide separators like --- inside html; separation is represented by array items
- Do NOT wrap the JSON in code fences

Available CSS classes and when to use them:
- highlight: accent 1–3 critical words inside headings or sentences (renders in brand color). Use only when emphasis is truly needed.
- cta: short call-to-action phrase; use once per slide (renders in brand color).
- image-placeholder: generic rectangle for manual images (not AI)
- ai-image: reserved for AI images only; must include data-prompt, data-width="1080", data-height="1080"

Improvement goals:
- Use the provided images as visual context to refine the copy and (optionally) improve ai-image data-prompt keywords for cohesion
- Prefer clear, concise, multi-line text that wraps naturally; keep headings ~6–8 words
- Keep or increase contrast by choosing where to apply highlight/cta classes; avoid unnecessary color elsewhere

Forbidden content:
- Do not output stray type tokens like: string, string?, number, number?, boolean, boolean?, any, unknown, never
`;

    const parts: any[] = [];
    const slidesText = `Current slides (count=${slides.length}):\n\n${slides
      .map((s, i) => `Slide ${i + 1}:\n${s}`)
      .join("\n\n")}`;

    const dirText = direction ? `\n\nStyle/Direction: ${direction}` : "";
    const promptText = prompt ? `\n\nTopic: ${prompt}` : "";

    parts.push({ type: "text", text: `${slidesText}${dirText}${promptText}\n\nImages follow (data-url previews):` });

    for (const [idx, img] of images.entries()) {
      const caption = `Image ${idx + 1} for slide ${img.slideIndex + 1}${img.prompt ? ` (prompt: ${img.prompt})` : ""}${
        img.alt ? ` (alt: ${img.alt})` : ""
      }`;
      parts.push({ type: "text", text: caption });
      parts.push({ type: "image_url", image_url: { url: img.src } });
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
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
    if (!content) {
      return NextResponse.json({ error: "No content returned from model" }, { status: 502 });
    }

    type SlidesResponse = { slides: { html: string }[] };
    let parsed: SlidesResponse;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return NextResponse.json({ error: "Model returned non-JSON content" }, { status: 502 });
    }

    if (!parsed || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      return NextResponse.json({ error: "JSON missing 'slides' array" }, { status: 502 });
    }

    const allowedClasses = new Set(["highlight", "cta", "image-placeholder", "ai-image"]);

    function basicSanitize(htmlFragment: string): string {
      let out = String(htmlFragment || "")
        .replace(/```[a-zA-Z]*\n?|```/g, "")
        .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*(script|style)\s*>/gi, "");
      out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
      out = out.replace(/class\s*=\s*"([^"]*)"/gi, (_m, cls: string) => {
        const filtered = cls
          .split(/\s+/)
          .filter((c: string) => allowedClasses.has(c))
          .join(" ");
        return filtered ? `class="${filtered}"` : "";
      });
      return out.trim();
    }

    const sanitizedSlides = parsed.slides
      .slice(0, desiredCount)
      .map(s => ({ html: basicSanitize(String(s?.html || "")) }));
    if (!sanitizedSlides.every(s => s.html)) {
      return NextResponse.json({ error: "One or more slides are empty after sanitize" }, { status: 502 });
    }

    const joinedHtml = sanitizedSlides.map(s => s.html).join("\n\n---\n\n");
    return NextResponse.json({ html: joinedHtml });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}
