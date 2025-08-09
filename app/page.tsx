"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SlideRenderer } from "@/components/SlideRenderer";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { toast } from "sonner";

const DEFAULT_HTML = `<h1>Hook your audience in <span class="highlight">3 seconds</span></h1>
<p>Write a <em>bold claim</em> and a <strong>short supporting</strong> line.</p>

---

<h2>Show, don't tell</h2>
<div class="ai-image" data-prompt="A laptop mockup visualization" data-width="1080" data-height="1080"></div>

---

<h1>End with a <span class="cta">clear CTA</span></h1>
<p>Add your <em>call to action</em> and a <strong>link or handle</strong>.</p>`;

export default function Page() {
  const [htmlContent, setHtmlContent] = useState<string>(DEFAULT_HTML);
  const [prompt, setPrompt] = useState<string>("2 reasons to switch to TypeScript");
  const [direction, setDirection] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [exportPreviews, setExportPreviews] = useState<string[]>([]);

  // Ensure iframe content is fully laid out (fonts/styles) before rasterizing
  const waitForIframeReady = async (iframe: HTMLIFrameElement) => {
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) return;
    // wait for fonts if supported
    // @ts-ignore
    if (doc.fonts && typeof doc.fonts.ready?.then === "function") {
      try {
        // @ts-ignore
        await doc.fonts.ready;
      } catch {}
    }
    await new Promise<void>(r => win.requestAnimationFrame(() => r()));
    await new Promise<void>(r => win.requestAnimationFrame(() => r()));
  };

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
        // Find the iframe inside the node
        const iframe = node.querySelector("iframe") as HTMLIFrameElement;
        if (!iframe || !iframe.contentDocument) {
          throw new Error("Could not access iframe content");
        }

        await waitForIframeReady(iframe);
        // Export the exact same DOM root as preview (html element)
        const rootEl = iframe.contentDocument.documentElement;
        // Ensure no transparent sampling on edges
        const dataUrl = await toPng(rootEl, {
          width: 1080,
          height: 1920,
          pixelRatio: 1,
          cacheBust: true,
          // Avoid font embedding differences
          skipFonts: true,
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

  // Dev-only: generate PNGs and show them inline without ZIP
  const handlePreviewExports = async () => {
    if (!slides.length) {
      toast("Nothing to preview. Add some HTML content.");
      return;
    }
    try {
      setIsPreviewing(true);
      const urls: string[] = [];
      for (let i = 0; i < slides.length; i++) {
        const node = slideRefs.current[i];
        if (!node) continue;
        const iframe = node.querySelector("iframe") as HTMLIFrameElement | null;
        if (!iframe || !iframe.contentDocument) continue;
        await waitForIframeReady(iframe);
        const rootEl = iframe.contentDocument.documentElement;
        rootEl.style.margin = "0";
        rootEl.style.padding = "0";
        const dataUrl = await toPng(rootEl, {
          width: 1080,
          height: 1920,
          pixelRatio: 1,
          cacheBust: true,
          skipFonts: true,
          backgroundColor: "#000000",
          style: { margin: "0", padding: "0" },
        });
        urls.push(dataUrl);
      }
      setExportPreviews(urls);
      if (urls.length) toast.success("Generated export previews");
    } catch (e) {
      console.error(e);
      toast.error("Preview export failed");
    } finally {
      setIsPreviewing(false);
    }
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
            <Button
              variant="outline"
              onClick={handlePreviewExports}
              disabled={isPreviewing}
              className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              {isPreviewing ? "Previewing…" : "Dev: Preview PNGs"}
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
                placeholder="<h1>Slide title</h1>\n<p>Your content here...</p>\n\n---\n\n<h2>Next slide</h2>"
              />
              <p className="text-xs text-slate-400">
                💡 <strong>Tip:</strong> Use semantic HTML (h1, h2, p, strong, em). Special classes: "highlight", "cta",
                "image-placeholder".
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
                      <SlideRenderer
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
            {exportPreviews.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-300">
                    Dev: Exported PNG previews ({exportPreviews.length})
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExportPreviews([])}
                      className="border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {exportPreviews.map((url, i) => (
                    <div
                      key={i}
                      className="border border-slate-600 rounded-lg overflow-hidden bg-black flex items-center justify-center"
                      style={{ width: 1080 * scale, height: 1920 * scale }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`export-${i + 1}`}
                        width={1080 * scale}
                        height={1920 * scale}
                        className="object-contain"
                      />
                    </div>
                  ))}
                </div>
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
