"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { SlideRenderer, type SlideRendererHandle } from "@/components/SlideRenderer";
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
  const [slideCount, setSlideCount] = useState<number>(2);
  const [editPrompt, setEditPrompt] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isImproving, setIsImproving] = useState<boolean>(false);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [exportPreviews, setExportPreviews] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [activeModalIndex, setActiveModalIndex] = useState<number | null>(null);
  const [modalImageUrl, setModalImageUrl] = useState<string>("");
  const [isCapturingForModal, setIsCapturingForModal] = useState<boolean>(false);
  const [isEditingSlide, setIsEditingSlide] = useState<boolean>(false);
  const recaptureTimeoutRef = useRef<number | null>(null);
  type HistoryEntry = { id: string; html: string; prompt?: string; label?: string; timestamp: number };
  const [slideHistories, setSlideHistories] = useState<Record<number, HistoryEntry[]>>({});

  const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

  const truncateLabel = (text?: string, max = 40) => {
    const s = (text || "").trim();
    if (!s) return "Edit";
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  };

  const initHistory = (index: number, currentSlides: string[]) => {
    setSlideHistories(prev => {
      const current = prev[index] || [];
      const currentHtml = currentSlides[index] || "";
      if (current.length === 0) {
        return {
          ...prev,
          [index]: [{ id: generateId(), html: currentHtml, timestamp: Date.now(), label: "Initial" }],
        };
      }
      return prev;
    });
  };

  const addHistory = (index: number, html: string, prompt?: string, label?: string) => {
    setSlideHistories(prev => {
      const list = prev[index] || [];
      const next = [
        ...list,
        { id: generateId(), html, prompt, label: label || truncateLabel(prompt), timestamp: Date.now() },
      ];
      // keep last 20
      return { ...prev, [index]: next.slice(-20) };
    });
  };

  // Persist history to localStorage
  useEffect(() => {
    try {
      const payload = JSON.stringify(slideHistories);
      localStorage.setItem("tiktok-slide-histories", payload);
    } catch {}
  }, [slideHistories]);

  // Load persisted history on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tiktok-slide-histories");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setSlideHistories(parsed as Record<number, HistoryEntry[]>);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ensure each visible slide has an initial baseline in history (after slides computed)
  useEffect(() => {
    // Defer to end of event loop so 'slides' is definitely initialized
    const t = setTimeout(() => {
      const currentSlides = htmlContent.split(/\n\s*---\s*\n/gm);
      currentSlides.forEach((_, i) => initHistory(i, currentSlides));
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlContent]);

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

  const captureOptions = {
    width: 1080,
    height: 1920,
    pixelRatio: 1,
    cacheBust: true,
    backgroundColor: "#000000",
    // Avoid cross-origin stylesheet access (Google Fonts CSS) during embedding
    // Let the browser-rendered fonts rasterize directly
    skipFonts: true,
  };

  const slides = useMemo(() => {
    return htmlContent.split(/\n\s*---\s*\n/gm);
  }, [htmlContent]);

  const slideRefs = useRef<(SlideRendererHandle | null)[]>([]);
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
      const handle = slideRefs.current[i];
      if (!handle) continue;
      try {
        const dataUrl = await handle.capturePng({ ...(captureOptions as any), engine: "html2canvas" });
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
        const handle = slideRefs.current[i];
        if (!handle) continue;
        const dataUrl = await handle.capturePng({ ...(captureOptions as any), engine: "html2canvas" });
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
        body: JSON.stringify({ prompt, direction, slideCount }),
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

  // Debounced recapture of the modal image when the underlying slide content changes
  const requestModalRecapture = (index: number, delay = 200) => {
    if (!isModalOpen || activeModalIndex !== index) return;
    if (recaptureTimeoutRef.current) {
      window.clearTimeout(recaptureTimeoutRef.current);
    }
    recaptureTimeoutRef.current = window.setTimeout(async () => {
      try {
        setIsCapturingForModal(true);
        const handle = slideRefs.current[index];
        if (handle) {
          const url = await handle.capturePng({ width: 1080, height: 1920, engine: "html2canvas" });
          setModalImageUrl(url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsCapturingForModal(false);
      }
    }, delay) as unknown as number;
  };

  // React to global html changes while a modal is open
  useEffect(() => {
    if (isModalOpen && activeModalIndex !== null) {
      requestModalRecapture(activeModalIndex, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [htmlContent]);

  // Modal helpers
  const openModal = async (index: number) => {
    setActiveModalIndex(index);
    setModalImageUrl("");
    setIsModalOpen(true); // open immediately for instant feedback
    initHistory(index, slides);
    setIsCapturingForModal(true);
    try {
      const handle = slideRefs.current[index];
      if (handle) {
        const dataUrl = await handle.capturePng({
          width: 1080,
          height: 1920,
          pixelRatio: 1,
          backgroundColor: "#000000",
          engine: "html2canvas",
        });
        setModalImageUrl(dataUrl);
        if (typeof document !== "undefined") {
          document.documentElement.style.overflow = "hidden";
        }
      }
    } catch (e) {
      console.error("Failed to capture slide for modal:", e);
      toast.error("Failed to open preview");
    } finally {
      setIsCapturingForModal(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveModalIndex(null);
    setModalImageUrl("");
    if (typeof document !== "undefined") {
      document.documentElement.style.overflow = "";
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function downscaleDataUrl(dataUrl: string, maxDim = 512, quality = 0.7): Promise<string> {
    try {
      const img = await loadImage(dataUrl);
      const { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return dataUrl;
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL("image/jpeg", quality);
    } catch {
      return dataUrl;
    }
  }

  const handleImprove = async () => {
    if (!slides.length) {
      toast("Nothing to improve. Generate or paste slides first.");
      return;
    }
    try {
      setIsImproving(true);
      // Collect up to 2 images per slide (downscaled)
      const images: { slideIndex: number; src: string; alt?: string; prompt?: string }[] = [];
      for (let i = 0; i < slides.length; i++) {
        const handle = slideRefs.current[i];
        if (!handle) continue;
        const iframe = handle.getIframe();
        if (!iframe || !iframe.contentDocument) continue;
        await waitForIframeReady(iframe);
        const doc = iframe.contentDocument;
        const containers = Array.from(doc.querySelectorAll(".ai-image")) as HTMLElement[];
        let taken = 0;
        for (const el of containers) {
          const img = el.querySelector("img") as HTMLImageElement | null;
          if (!img) continue;
          const src = img.getAttribute("src") || "";
          if (!src.startsWith("data:")) continue;
          const small = await downscaleDataUrl(src, 512, 0.7);
          images.push({
            slideIndex: i,
            src: small,
            alt: img.getAttribute("alt") || undefined,
            prompt: el.getAttribute("data-prompt") || undefined,
          });
          taken++;
          if (taken >= 2) break;
        }
      }

      const res = await fetch("/api/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides, images, direction, prompt, slideCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to improve");
      }
      const html = String(data.html || "").trim();
      if (!html) throw new Error("Empty response from model");
      setHtmlContent(html);
      toast.success("Improved slides with image context");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Improve failed");
    } finally {
      setIsImproving(false);
    }
  };

  const scale = 0.25;

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <header className="sticky top-0 z-10 border-b border-zinc-700 bg-zinc-900/90 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between py-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 via-white to-sky-400 bg-clip-text text-transparent">
              TikTok Slideshow Generator
            </h1>
            <p className="text-zinc-400 mt-1">Generate AI-powered slides • Markdown → 1080x1920 export</p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={handleExportAll}
              className="bg-gradient-to-r from-red-600 to-sky-600 hover:from-red-700 hover:to-sky-700 text-white border-0"
            >
              Export ZIP
            </Button>
            <Button
              variant="outline"
              onClick={handlePreviewExports}
              disabled={isPreviewing}
              className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              {isPreviewing ? "Previewing…" : "Dev: Preview PNGs"}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto grid grid-cols-1 gap-8 py-8 lg:grid-cols-5">
        <section className="lg:col-span-2 space-y-8">
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full"></span>
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
                  className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-sky-500 focus:ring-sky-500"
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
                  className="bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-sky-500 focus:ring-sky-500"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="slides" className="text-sm font-medium text-slate-300">
                  Number of slides
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    id="slides"
                    type="number"
                    min={1}
                    max={10}
                    value={slideCount}
                    onChange={e => setSlideCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                    className="w-24 bg-zinc-800 border-zinc-600 text-white"
                  />
                  <span className="text-xs text-zinc-500">(1–10)</span>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-red-600 to-sky-600 hover:from-red-700 hover:to-sky-700 text-white border-0 flex-1"
                >
                  {isGenerating ? "Generating…" : "Go viral!"}
                </Button>
                <Button
                  onClick={handleImprove}
                  disabled={isImproving || slides.length === 0}
                  className="bg-zinc-700 hover:bg-zinc-600 text-white border-0"
                >
                  {isImproving ? "Improving…" : "🪄 Improve with images"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPrompt("");
                    setDirection("");
                  }}
                  className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-400 rounded-full"></span>
              HTML Editor
            </h2>
            <div className="space-y-3">
              <Textarea
                id="html"
                value={htmlContent}
                onChange={e => setHtmlContent(e.target.value)}
                className="min-h-[420px] bg-zinc-800 border-zinc-600 text-white placeholder:text-zinc-400 focus:border-sky-500 focus:ring-sky-500 font-mono text-sm"
                placeholder="<h1>Slide title</h1>\n<p>Your content here...</p>\n\n---\n\n<h2>Next slide</h2>"
              />
              <p className="text-xs text-zinc-400">
                💡 <strong>Tip:</strong> Use semantic HTML (h1, h2, p, strong, em). Special classes: "highlight", "cta",
                "image-placeholder".
              </p>
            </div>
          </div>
        </section>

        <section className="lg:col-span-3">
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-xl p-6">
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-sky-400 rounded-full"></span>
              Preview ({slides.length} slide{slides.length !== 1 ? "s" : ""})
            </h2>
            {slides.length === 0 ? (
              <div className="rounded-xl border border-zinc-600 bg-zinc-700/30 p-12 text-center">
                <div className="text-zinc-400 text-lg mb-2">🎬</div>
                <p className="text-zinc-400">Your slides preview will appear here</p>
                <p className="text-zinc-500 text-sm mt-1">Generate with AI or write HTML manually</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {slides.map((s, i) => (
                  <div
                    key={i}
                    className={`border border-zinc-600 rounded-lg overflow-hidden hover:border-sky-500/50 transition-colors ${
                      isCapturingForModal ? "cursor-wait" : "cursor-pointer"
                    }`}
                    role="button"
                    aria-label={`Open slide ${i + 1}`}
                    onClick={() => !isCapturingForModal && openModal(i)}
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
                        onContentChanged={() => requestModalRecapture(i)}
                        ref={instance => {
                          slideRefs.current[i] = instance;
                        }}
                      />
                    </div>
                    <div className="bg-zinc-700/50 px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-zinc-400 font-medium">Slide {i + 1}</span>
                      <span className="text-xs text-zinc-500">1080×1920</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {exportPreviews.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-zinc-300">
                    Dev: Exported PNG previews ({exportPreviews.length})
                  </h3>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExportPreviews([])}
                      className="border-zinc-600 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {exportPreviews.map((url, i) => (
                    <div
                      key={i}
                      className="border border-zinc-600 rounded-lg overflow-hidden bg-black flex items-center justify-center"
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

      {isModalOpen && activeModalIndex !== null && modalImageUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          onClick={closeModal}
        >
          <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-3">
                <h3 className="text-white text-lg font-medium">Slide {activeModalIndex + 1}</h3>
                <span className="text-slate-400 text-sm">1080×1920</span>
              </div>
              <button
                onClick={closeModal}
                className="px-4 py-2 rounded-lg bg-slate-800/80 backdrop-blur text-white border border-slate-600 hover:bg-slate-700/80 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="relative rounded-xl border border-slate-600 bg-slate-900/50 backdrop-blur shadow-2xl overflow-hidden flex items-center justify-center min-h-[40vh]">
              {!modalImageUrl ? (
                <div className="flex items-center gap-3 text-slate-300">
                  <svg className="animate-spin h-5 w-5 text-slate-300" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  <span>Loading preview…</span>
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={modalImageUrl}
                  alt={`Slide ${activeModalIndex + 1}`}
                  className="block max-w-full max-h-[80vh] w-auto h-auto object-contain"
                  style={{ aspectRatio: "1080/1920" }}
                />
              )}
              {(isCapturingForModal || isEditingSlide) && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-white text-sm">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span>{isEditingSlide ? "Applying edit…" : "Rendering…"}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Input
                placeholder="Describe how to edit this slide..."
                value={editPrompt}
                onChange={e => setEditPrompt(e.target.value)}
                className="flex-1 bg-slate-700 border-slate-600 text-white"
              />
              <Button
                disabled={!editPrompt.trim() || isEditingSlide}
                onClick={async () => {
                  try {
                    setIsEditingSlide(true);
                    const slideHtml = slides[activeModalIndex!] || "";
                    // Collect current inline images as context
                    let images: { src: string; alt?: string; prompt?: string }[] = [];
                    const handle = slideRefs.current[activeModalIndex!];
                    const iframe = handle?.getIframe();
                    const doc = iframe?.contentDocument || null;
                    if (doc) {
                      const containers = Array.from(doc.querySelectorAll(".ai-image")) as HTMLElement[];
                      for (const el of containers) {
                        const img = el.querySelector("img") as HTMLImageElement | null;
                        if (img && img.src?.startsWith("data:")) {
                          images.push({
                            src: img.src,
                            alt: img.alt || undefined,
                            prompt: el.getAttribute("data-prompt") || undefined,
                          });
                        }
                      }
                    }
                    const res = await fetch("/api/edit-slide", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ slideHtml, instruction: editPrompt, direction, images }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || "Failed to edit slide");
                    const updated = String(data.html || "");
                    const nextSlides = [...slides];
                    nextSlides[activeModalIndex!] = updated;
                    setHtmlContent(nextSlides.join("\n\n---\n\n"));
                    addHistory(activeModalIndex!, updated, editPrompt, "Edit");
                    setEditPrompt("");
                    // recapture after slight delay to allow iframe render
                    setTimeout(async () => {
                      const handle = slideRefs.current[activeModalIndex!];
                      if (handle) {
                        const url = await handle.capturePng({ width: 1080, height: 1920, engine: "html2canvas" });
                        setModalImageUrl(url);
                      }
                    }, 250);
                    toast.success("Slide updated");
                  } catch (e: any) {
                    console.error(e);
                    toast.error(e?.message || "Edit failed");
                  } finally {
                    setIsEditingSlide(false);
                  }
                }}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {isEditingSlide ? "Applying…" : "Apply Edit"}
              </Button>
            </div>
            {/* History */}
            {activeModalIndex !== null && (slideHistories[activeModalIndex]?.length || 0) > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-slate-300 text-sm font-medium">History</h4>
                  <span className="text-slate-500 text-xs">{slideHistories[activeModalIndex]!.length} versions</span>
                </div>
                <div className="max-h-48 overflow-auto rounded-md border border-slate-700 divide-y divide-slate-700 bg-slate-900/50">
                  {slideHistories[activeModalIndex]!.map((entry, idx) => ({ entry, idx }))
                    .reverse()
                    .map(({ entry, idx }) => (
                      <div key={entry.id} className="flex items-center justify-between px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-slate-200 text-xs font-medium truncate">
                            {entry.label || `v${idx + 1}`}
                          </div>
                          <div className="text-slate-500 text-[10px] truncate">
                            {new Date(entry.timestamp).toLocaleTimeString()} {entry.prompt ? `• ${entry.prompt}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="bg-slate-700 hover:bg-slate-600 text-white px-2 py-1"
                            onClick={async () => {
                              const index = activeModalIndex!;
                              const versionHtml = entry.html;
                              const nextSlides = [...slides];
                              nextSlides[index] = versionHtml;
                              setHtmlContent(nextSlides.join("\n\n---\n\n"));
                              setTimeout(async () => {
                                const handle = slideRefs.current[index];
                                if (handle) {
                                  const url = await handle.capturePng({
                                    width: 1080,
                                    height: 1920,
                                    engine: "html2canvas",
                                  });
                                  setModalImageUrl(url);
                                }
                              }, 250);
                            }}
                          >
                            Restore
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="border-t border-zinc-700 py-8 mt-12">
        <div className="container mx-auto text-center">
          <p className="text-zinc-400 text-sm">
            1080×1920 export • Perfect for TikTok, YouTube Shorts, and Instagram Reels
          </p>
          <p className="text-zinc-500 text-xs mt-2">
            Powered by OpenRouter AI • HTML-to-Image rendering • Built with Next.js
          </p>
        </div>
      </footer>
    </div>
  );
}
