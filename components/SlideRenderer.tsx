"use client";

import React, { forwardRef, useEffect, useRef } from "react";

interface SlideRendererProps {
  html: string;
}

export const SlideRenderer = forwardRef<HTMLDivElement, SlideRendererProps>(({ html }, ref) => {
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
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=TikTok+Sans:opsz,wght@12..36,300..900&display=swap" rel="stylesheet">
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
              font-family: 'TikTok Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }

            body {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              padding: 64px;
              overflow: hidden;
            }
            
            h1 {
              font-size: 64px;
              font-weight: 750;
              margin-bottom: 24px;
              line-height: 1.15;
              color: #f8fafc;
              white-space: normal;
              word-break: break-word;
              overflow-wrap: anywhere;
              hyphens: auto;
              text-wrap: pretty;
            }
            
            h2 {
              font-size: 48px;
              font-weight: 700;
              margin-bottom: 20px;
              line-height: 1.25;
              color: #e5e7eb;
              white-space: normal;
              word-break: break-word;
              overflow-wrap: anywhere;
              hyphens: auto;
              text-wrap: pretty;
            }
            
            h3 {
              font-size: 40px;
              font-weight: 650;
              margin-bottom: 16px;
              line-height: 1.3;
              color: #e2e8f0;
              white-space: normal;
              word-break: break-word;
              overflow-wrap: anywhere;
              hyphens: auto;
              text-wrap: pretty;
            }
            
            p {
              font-size: 32px;
              line-height: 1.45;
              color: #cbd5e1;
              margin-bottom: 12px;
              white-space: normal;
              word-break: break-word;
              overflow-wrap: anywhere;
              hyphens: auto;
              text-wrap: pretty;
            }
            
            strong {
              color: inherit;
              font-weight: 800;
              white-space: normal;
            }
            
            em {
              color: inherit;
              font-style: italic;
            }
            
            .highlight {
              color: #fe2c55;
              font-weight: 850;
              white-space: normal;
            }
            
            .image-placeholder {
              width: 640px;
              height: 320px;
              background: rgba(255,255,255,0.06);
              border: 1px solid rgba(255,255,255,0.18);
              border-radius: 12px;
              margin: 24px auto;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #e5e7eb;
              font-size: 22px;
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
          const res = await fetch("/api/image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt, width: w, height: h }),
          });
          const data = await res.json();

          // If another request started meanwhile, ignore this result
          if (el.getAttribute("data-req-id") !== reqId) continue;

          if (res.ok && data?.dataUrl) {
            const img = doc.createElement("img");
            img.src = data.dataUrl;
            img.alt = prompt;
            img.style.maxWidth = "80%";
            img.style.borderRadius = "12px";
            img.style.boxShadow = "0 8px 24px rgba(0,0,0,0.35)";
            img.style.margin = "24px auto";
            el.innerHTML = "";
            el.appendChild(img);
          } else {
            el.textContent = "Image generation failed";
          }
        } catch (e) {
          // If another request started meanwhile, ignore this result
          if (el.getAttribute("data-req-id") !== reqId) continue;
          el.textContent = "Image generation error";
        }
      }
    };
    // Kick off image loading
    loadImages();
  }, [html]);

  return (
    <div
      ref={containerRef}
      className="relative w-[1080px] h-[1920px] overflow-hidden"
      style={{ transform: "scale(0.25)", transformOrigin: "top left" }}
    >
      <div ref={ref} className="absolute inset-0">
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
});

SlideRenderer.displayName = "SlideRenderer";
