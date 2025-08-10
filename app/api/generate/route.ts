import { NextRequest, NextResponse } from "next/server";

type GenerateRequestBody = {
  prompt: string;
  direction?: string;
  model?: string;
  slideCount?: number;
};

export async function POST(req: NextRequest) {
  try {
    const { prompt, direction, model, slideCount }: GenerateRequestBody = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set on server" }, { status: 500 });
    }

    const desiredCount = Math.min(10, Math.max(1, Number.isFinite(slideCount as number) ? (slideCount as number) : 2));

    const system = `
You are to produce exactly ${desiredCount} TikTok slideshow slides for a vertical portrait video. Respond ONLY with a JSON object (no code fences) that conforms to this schema:

type SlidesResponse = {
  slides: { html: string }[]; // exactly ${desiredCount} items
};

Rules for slides[i].html:
- Use only minimal, semantic HTML with these tags: h1, h2, h3, p, strong, em, div, span
- Avoid inline styles. No arbitrary attributes.
- Exception: If the user explicitly asks for custom styles in the direction (e.g., says "custom styles", "inline styles", or similar), you may include targeted inline style="..." attributes where appropriate.
- Emphasis: <strong> for bold, <em> for italics
- Special text: <span class="highlight">…</span> and <span class="cta">…</span>
- Images: To request an AI image, insert exactly: <div class="ai-image" data-prompt="..." data-width="1080" data-height="1080"></div>
- Do NOT include any slide separators like --- inside html; separation is represented by array items
- Do NOT include URLs or base64 data in html
- Do NOT wrap the JSON in code fences

Writing style:
- Short, punchy, TikTok/social-media tough love text
- Hierarchy: h1 = main title, h2 = subtitle, p = body

Available CSS classes and when to use them:
- highlight: accent 1–3 critical words inside headings or sentences (renders in brand color). Use only when emphasis is truly needed.
- cta: short call-to-action phrase; use once per slide (renders in brand color).
- image-placeholder: generic rectangle for manual images (not AI)
- ai-image: reserved for AI images only; must include data-prompt, data-width="1080", data-height="1080"

Content constraints to avoid overflow:
- Keep headings under ~6–8 words; prefer text that wraps to multiple lines naturally
- Split long ideas into multiple <p> blocks instead of one long sentence
- Avoid adding colors via inline styles; color accents should come only from the highlight/cta classes.
- Never rely on <br>; use natural wrapping and short phrases

Forbidden content:
- Do not output stray type tokens like: string, string?, number, number?, boolean, boolean?, any, unknown, never
`;

    const userContent = [
      `Topic or seed: ${prompt}`,
      direction ? `Direction or style guide: ${direction}` : null,
      `Produce exactly ${desiredCount} slides (no extra cover unless it counts toward the total).`,
      "This is for a TikTok slideshow in vertical portrait orientation.",
      "Assume final render size is exactly 1080x1920 on black background using TikTok Sans.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-5-nano",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
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

    // Parse and validate the JSON content from the model
    type SlidesResponse = { slides: { html: string }[] };
    let parsed: SlidesResponse;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return NextResponse.json({ error: "Model returned non-JSON content" }, { status: 502 });
    }

    if (!parsed || !Array.isArray(parsed.slides)) {
      return NextResponse.json({ error: "JSON missing 'slides' array" }, { status: 502 });
    }
    // Enforce the requested number of slides
    if (parsed.slides.length < desiredCount) {
      return NextResponse.json({ error: `Model returned fewer than ${desiredCount} slides` }, { status: 502 });
    }

    const allowedTags = new Set(["h1", "h2", "h3", "p", "strong", "em", "div", "span"]);
    const allowedClasses = new Set(["highlight", "cta", "image-placeholder", "ai-image"]);

    function basicSanitize(htmlFragment: string): string {
      // Remove script/style tags and code fences if any sneaked in
      let out = htmlFragment
        .replace(/```[a-zA-Z]*\n?|```/g, "")
        .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*(script|style)\s*>/gi, "");
      // Very light attribute pruning: drop on* handlers
      out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
      // Optional: ensure class names are from allowed set (best-effort string replace)
      out = out.replace(/class\s*=\s*"([^"]*)"/gi, (_m, cls: string) => {
        const filtered = cls
          .split(/\s+/)
          .filter((c: string) => allowedClasses.has(c))
          .join(" ");
        return filtered ? `class="${filtered}"` : "";
      });
      // Remove stray TS type tokens if they appear as isolated words
      out = out.replace(/(^|\s)(?:string\??|number\??|boolean\??|any|unknown|never)(?=\b|\s|[.,!?:;]|$)/gi, " ");
      // Note: deep tag allow-list enforcement is non-trivial without an HTML parser; rely on model constraints
      return out.replace(/\s{2,}/g, " ").trim();
    }

    const sanitizedSlides = parsed.slides
      .slice(0, desiredCount)
      .map(s => ({ html: basicSanitize(String(s?.html || "")) }));
    if (!sanitizedSlides.every(s => s.html)) {
      return NextResponse.json({ error: "One or more slides are empty after sanitize" }, { status: 502 });
    }

    const joinedHtml = sanitizedSlides.map(s => s.html).join("\n\n---\n\n");

    return NextResponse.json({ html: joinedHtml });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}
