import { NextRequest, NextResponse } from "next/server";

type GenerateRequestBody = {
  prompt: string;
  direction?: string;
  model?: string;
};

export async function POST(req: NextRequest) {
  try {
    const { prompt, direction, model }: GenerateRequestBody = await req.json();

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENROUTER_API_KEY not set on server" }, { status: 500 });
    }

    const system = [
      "You generate exactly 2 vertical video slides as HTML content.",
      "Each slide should be a complete HTML structure with inline CSS styling.",
      "Separate slides with a line that contains only ---.",
      "Use modern, beautiful styling with gradients, bold text, and engaging layouts.",
      "Prefer short, punchy text suitable for TikTok/social media.",
      "Use semantic HTML with proper typography hierarchy (h1, h2, p, strong, em).",
      "Style text with vibrant colors, gradients, and modern fonts.",
      "If you include images, use placeholder divs with descriptive text instead of actual img tags.",
      "Make slides visually striking with good contrast and modern design.",
      "Each slide should be self-contained HTML that renders beautifully on a black background.",
    ].join(" \n");

    const userContent = [
      `Topic or seed: ${prompt}`,
      direction ? `Direction or style guide: ${direction}` : null,
      "Produce exactly 2 slides.",
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
        model: model || "openai/gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.7,
      }),
      // @ts-ignore RequestInit type mismatch in edge/runtime sometimes
      cache: "no-store",
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${errText}` }, { status: 502 });
    }

    const data = (await response.json()) as any;
    const html: string | undefined = data?.choices?.[0]?.message?.content;
    if (!html) {
      return NextResponse.json({ error: "No content returned from model" }, { status: 502 });
    }

    return NextResponse.json({ html });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Unknown error" }, { status: 500 });
  }
}
