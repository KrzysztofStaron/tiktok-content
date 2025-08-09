"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { toPng } from "html-to-image";

interface SlideRendererProps {
  html: string;
  scale?: number;
  onContentChanged?: () => void;
}

type CaptureOptions = {
  width?: number;
  height?: number;
  pixelRatio?: number;
  backgroundColor?: string;
  engine?: "auto" | "html2canvas" | "html-to-image";
};

export type SlideRendererHandle = {
  capturePng: (options?: CaptureOptions) => Promise<string>;
  getIframe: () => HTMLIFrameElement | null;
};

// In-memory cache keyed by prompt
const promptToDataUrlCache: Map<string, string> = new Map();
// Track in-flight requests to deduplicate
const promptToInFlight: Map<string, Promise<string>> = new Map();

export const SlideRenderer = forwardRef<SlideRendererHandle, SlideRendererProps>(
  ({ html, scale = 0.25, onContentChanged }, ref) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!iframeRef.current) return;

      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Create the complete HTML document
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            html, body {
              width: 1080px;
              height: 1920px;
              margin: 0;
              padding: 0;
            }
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            
            html {
              background: #000000;
              color: #ffffff;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              font-kerning: normal;
              font-variant-ligatures: none;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;

            }

            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              padding: 48px 56px;
              overflow: hidden;
            }

            /* Prevent html-to-image from attempting to read external CSS rules */
            @font-face { font-family: '__noembed'; src: local('☺'); unicode-range: U+F0000; }
            
            h1 {
              font-size: 64px;
              font-weight: 750;
              margin-bottom: 24px;
              line-height: 1.15;
              color: #f8fafc;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
            }
            
            h2 {
              font-size: 48px;
              font-weight: 700;
              margin-bottom: 20px;
              line-height: 1.25;
              color: #e5e7eb;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
            }
            
            h3 {
              font-size: 40px;
              font-weight: 650;
              margin-bottom: 16px;
              line-height: 1.3;
              color: #e2e8f0;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
            }
            
            p {
              font-size: 32px;
              line-height: 1.45;
              color: #cbd5e1;
              margin-bottom: 12px;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
            }
            
            strong {
              color: inherit;
              font-weight: 800;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
              margin: 0 0.12em;
              display: inline;
            }
            
            em {
              color: inherit;
              font-style: italic;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
              margin: 0 0.12em;
              display: inline;
            }
            
            .highlight {
              color: #fe2c55;
              font-weight: 850;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
              margin: 0 0.12em;
              display: inline;
            }

            .ai-image {
              width: 100%;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 320px;
            }
            
            .cta {
              color: #fe2c55;
              font-weight: 850;
              white-space: normal;
              word-spacing: normal;
              letter-spacing: normal;
              margin: 0 0.12em;
              display: inline;
            }

            /* Ensure spaces around inline emphasis elements even if the HTML omits them */
            strong::before, strong::after,
            em::before, em::after,
            .highlight::before, .highlight::after,
            .cta::before, .cta::after {
              content: " ";
            }
          </style>
        </head>
        <body>
          ${html}
        </body>
        </html>
      `;

      doc.open();
      doc.write(fullHtml);
      doc.close();

      // Notify parent shortly after initial render completes
      try {
        const win = iframe.contentWindow as Window | null;
        if (win && typeof win.requestAnimationFrame === "function") {
          win.requestAnimationFrame(() => {
            win.requestAnimationFrame(() => onContentChanged?.());
          });
        } else {
          setTimeout(() => onContentChanged?.(), 50);
        }
      } catch {}

      // After mount, find any ai-image nodes and fetch images
      const loadImages = async () => {
        const aiNodes = (doc.querySelectorAll(".ai-image") || []) as unknown as HTMLElement[];
        if (!aiNodes || !aiNodes.length) return;
        for (const el of Array.from(aiNodes)) {
          const prompt = el.getAttribute("data-prompt") || "";
          const w = Number(el.getAttribute("data-width") || "640");
          const h = Number(el.getAttribute("data-height") || "640");
          if (!prompt) continue;

          // Create a unique request id to avoid race conditions
          const reqId = String(performance.now() + Math.random());
          el.setAttribute("data-req-id", reqId);

          // Clear previous children immediately (remove old image)
          while (el.firstChild) el.removeChild(el.firstChild);
          el.textContent = "Generating image…";
          try {
            let dataUrl: string | undefined = promptToDataUrlCache.get(prompt);
            if (!dataUrl) {
              let inFlight = promptToInFlight.get(prompt);
              if (!inFlight) {
                inFlight = (async () => {
                  const res = await fetch("/api/image", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt, width: w, height: h }),
                  });
                  if (!res.ok) {
                    const text = await res.text().catch(() => "");
                    throw new Error(text || "Image API error");
                  }
                  const data = await res.json();
                  if (!data?.dataUrl) throw new Error("No dataUrl returned");
                  promptToDataUrlCache.set(prompt, data.dataUrl);
                  return data.dataUrl as string;
                })();
                promptToInFlight.set(prompt, inFlight);
              }
              try {
                dataUrl = await inFlight;
              } finally {
                promptToInFlight.delete(prompt);
              }
            }

            // If another request started meanwhile, ignore this result
            if (el.getAttribute("data-req-id") !== reqId) continue;

            if (dataUrl) {
              const img = doc.createElement("img");
              img.src = dataUrl;
              img.alt = prompt;
              img.style.maxWidth = "80%";
              img.style.borderRadius = "12px";
              img.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
              img.style.margin = "24px auto";
              el.innerHTML = "";
              el.appendChild(img);
              onContentChanged?.();
            } else {
              el.textContent = "Image generation failed";
              onContentChanged?.();
            }
          } catch (e) {
            // If another request started meanwhile, ignore this result
            if (el.getAttribute("data-req-id") !== reqId) continue;
            el.textContent = "Image generation error";
            onContentChanged?.();
          }
        }
      };
      // Kick off image loading
      loadImages();
    }, [html]);

    function getIframe(): HTMLIFrameElement | null {
      return iframeRef.current;
    }

    async function waitForIframeReady(iframe: HTMLIFrameElement): Promise<void> {
      const doc = iframe.contentDocument;
      const win = iframe.contentWindow as Window | null;
      if (!doc || !win) return;
      // @ts-ignore
      if (doc.fonts && typeof doc.fonts.ready?.then === "function") {
        try {
          // @ts-ignore
          await doc.fonts.ready;
        } catch {}
      }
      await new Promise<void>(r => win.requestAnimationFrame(() => r()));
      await new Promise<void>(r => win.requestAnimationFrame(() => r()));
    }

    async function capturePng(options?: CaptureOptions): Promise<string> {
      const iframe = iframeRef.current;
      if (!iframe) throw new Error("Iframe not ready");
      await waitForIframeReady(iframe);
      const doc = iframe.contentDocument;
      if (!doc) throw new Error("Iframe document not available");
      const rootEl = doc.documentElement as HTMLElement;
      const width = options?.width ?? 1080;
      const height = options?.height ?? 1920;
      const backgroundColor = options?.backgroundColor ?? "#000000";
      const pixelRatio = options?.pixelRatio ?? 1;

      const engine = options?.engine ?? "html2canvas";

      async function renderWithHtml2Canvas(): Promise<string> {
        const mod = await import("html2canvas");
        const html2canvas = mod.default;
        const safeIframe = iframeRef.current as HTMLIFrameElement;
        const safeDoc = safeIframe.contentDocument as Document;
        const target = (safeDoc.body as HTMLElement) || rootEl;
        const canvas = await html2canvas(target, {
          backgroundColor,
          scale: pixelRatio,
          useCORS: true,
          allowTaint: true,
          logging: false,
          windowWidth: width,
          windowHeight: height,
          width,
          height,
          x: 0,
          y: 0,
        } as any);
        return canvas.toDataURL("image/png");
      }

      async function renderWithHtmlToImage(): Promise<string> {
        return toPng(rootEl, {
          width,
          height,
          pixelRatio,
          cacheBust: true,
          skipFonts: true,
          backgroundColor,
          style: { margin: "0", padding: "0", transformOrigin: "top left" },
        } as any);
      }

      if (engine === "html2canvas") {
        return renderWithHtml2Canvas();
      }
      if (engine === "html-to-image") {
        return renderWithHtmlToImage();
      }
      // auto: try html-to-image first, fallback to html2canvas on failure
      try {
        return await renderWithHtmlToImage();
      } catch (_e) {
        return await renderWithHtml2Canvas();
      }
    }

    useImperativeHandle(ref, () => ({ capturePng, getIframe }), []);

    return (
      <div
        ref={containerRef}
        className="relative w-[1080px] h-[1920px] overflow-hidden"
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
      >
        <div className="absolute inset-0">
          <iframe
            ref={iframeRef}
            width="1080"
            height="1920"
            style={{
              border: "none",
              background: "black",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    );
  }
);

SlideRenderer.displayName = "SlideRenderer";
