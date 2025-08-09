"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SlideHTML } from "@/components/SlideHTML";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";

const DEFAULT_HTML = `<div style="text-align: center; padding: 40px; color: white; font-family: system-ui, -apple-system, sans-serif;">
  <h1 style="font-size: 4rem; font-weight: bold; background: linear-gradient(45deg, #8b5cf6, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 2rem;">
    Hook your audience in <strong>3 seconds</strong>
  </h1>
  <p style="font-size: 2rem; color: #d1d5db; line-height: 1.4;">
    Write a <em style="color: #a78bfa;">bold claim</em> and a <strong style="color: #f472b6;">short supporting</strong> line.
  </p>
</div>

---

<div style="text-align: center; padding: 40px; color: white; font-family: system-ui, -apple-system, sans-serif;">
  <h1 style="font-size: 4rem; font-weight: bold; color: #fbbf24; margin-bottom: 2rem;">
    Show, don't tell
  </h1>
  <div style="width: 600px; height: 300px; background: linear-gradient(135deg, #374151, #6b7280); border: 3px solid #9ca3af; border-radius: 16px; margin: 2rem auto; display: flex; align-items: center; justify-content: center; color: #d1d5db; font-size: 1.5rem;">
    💻 Laptop mockup visualization
  </div>
</div>

---

<div style="text-align: center; padding: 40px; color: white; font-family: system-ui, -apple-system, sans-serif;">
  <h1 style="font-size: 4rem; font-weight: bold; background: linear-gradient(45deg, #10b981, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 2rem;">
    End with a <strong>clear CTA</strong>
  </h1>
  <p style="font-size: 2rem; color: #d1d5db; line-height: 1.4;">
    Add your <em style="color: #34d399;">call to action</em> and a <strong style="color: #60a5fa;">link or handle</strong>.
  </p>
</div>`;

export default function Page() {
  const [htmlContent, setHtmlContent] = useState<string>(DEFAULT_HTML);
  const [prompt, setPrompt] = useState<string>("");
  const [direction, setDirection] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const slides = useMemo(() => {
    return htmlContent
      .split(/\n\s*---\s*\n/gm)
      .map(s => s.trim())
      .filter(Boolean);
  }, [htmlContent]);

  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  slideRefs.current = Array(slides.length)
    .fill(null)
    .map((_, i) => slideRefs.current[i] || null);

  const handleExportAll = async () => {
    if (!slides.length) {
      toast("Nothing to export. Add some HTML content.");
      return;
    }

    const zip = new JSZip();
    toast("Exporting slides… This may take a moment.");

    for (let i = 0; i < slides.length; i++) {
      const node = slideRefs.current[i];
      if (!node) continue;
      try {
        const dataUrl = await toPng(node, {
          width: 1080,
          height: 1920,
          pixelRatio: 1,
          cacheBust: true,
          skipFonts: false,
          backgroundColor: "#000000",
        });
        const base64 = dataUrl.split(",")[1];
        const index = (i + 1).toString().padStart(2, "0");
        zip.file(`slide-${index}.png`, base64, { base64: true });
      } catch (e) {
        console.error(e);
        toast.error(`Failed to export slide ${i + 1}`);
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "slides-1080x1920.zip");
    toast.success("Export complete! Download started.");
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast("Add a topic or prompt first.");
      return;
    }
    try {
      setIsGenerating(true);
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, direction }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to generate");
      }
      const html = String(data.html || "").trim();
      if (!html) throw new Error("Empty response from model");
      setHtmlContent(html);
      toast.success("Generated 2 slides");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Generation failed");
    } finally {
      setIsGenerating(false);
    }
  };

  const scale = 0.25;

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-900/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between py-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-transparent">
              TikTok Slideshow Generator
            </h1>
            <p className="text-slate-400 mt-1">Generate AI-powered slides • Markdown → 1080x1920 export</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleExportAll}
              className="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0"
            >
              Export ZIP
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid grid-cols-1 gap-8 py-8 lg:grid-cols-5">
        <section className="lg:col-span-2 space-y-8">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-violet-400 rounded-full"></span>
              AI Generation
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label htmlFor="prompt" className="text-sm font-medium text-slate-300">
                  Topic or prompt
                </label>
                <Input
                  id="prompt"
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="e.g., 2 reasons to switch to TypeScript"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-violet-500 focus:ring-violet-500"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="direction" className="text-sm font-medium text-slate-300">
                  Direction or style (optional)
                </label>
                <Input
                  id="direction"
                  value={direction}
                  onChange={e => setDirection(e.target.value)}
                  placeholder="e.g., witty, Gen-Z tone, suspenseful ending"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-violet-500 focus:ring-violet-500"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-700 hover:to-pink-700 text-white border-0 flex-1"
                >
                  {isGenerating ? "Generating…" : "✨ Generate 2 slides"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPrompt("");
                    setDirection("");
                  }}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-pink-400 rounded-full"></span>
              HTML Editor
            </h2>
            <div className="space-y-3">
              <Textarea
                id="html"
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                className="min-h-[420px] bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 focus:border-violet-500 focus:ring-violet-500 font-mono text-sm"
                placeholder="<div>Your HTML content here...</div>\n\n---\n\n<div>Next slide</div>"
              />
              <p className="text-xs text-slate-400">
                💡 <strong>Tip:</strong> Use full HTML with inline CSS for rich formatting, gradients, and modern
                styling.
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-3">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-400 rounded-full"></span>
              Preview ({slides.length} slide{slides.length !== 1 ? "s" : ""})
            </h2>
            {slides.length === 0 ? (
              <div className="rounded-xl border border-slate-600 bg-slate-700/30 p-12 text-center">
                <div className="text-slate-400 text-lg mb-2">🎬</div>
                <p className="text-slate-400">Your slides preview will appear here</p>
                <p className="text-slate-500 text-sm mt-1">Generate with AI or write HTML manually</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {slides.map((s, i) => (
                  <div
                    key={i}
                    className="border border-slate-600 rounded-lg overflow-hidden hover:border-violet-500/50 transition-colors"
                  >
                    <div
                      className="relative bg-black overflow-hidden"
                      style={{
                        width: 1080 * scale,
                        height: 1920 * scale,
                      }}
                    >
                      <SlideHTML
                        html={s}
                        ref={el => {
                          slideRefs.current[i] = el;
                        }}
                      />
                    </div>
                    <div className="bg-slate-700/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">Slide {i + 1}</span>
                      <span className="text-xs text-slate-500">1080×1920</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-700 py-8 mt-12">
        <div className="container mx-auto text-center">
          <p className="text-slate-400 text-sm">
            1080×1920 export • Perfect for TikTok, YouTube Shorts, and Instagram Reels
          </p>
          <p className="text-slate-500 text-xs mt-2">
            Powered by OpenRouter AI • HTML-to-Image rendering • Built with Next.js
          </p>
        </div>
      </footer>
    </div>
  );
}
