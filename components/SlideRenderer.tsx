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
              line-height: 1.1;
              color: #f8fafc;
              white-space: nowrap;
              word-break: keep-all;
              overflow-wrap: normal;
            }
            
            h2 {
              font-size: 48px;
              font-weight: 700;
              margin-bottom: 20px;
              line-height: 1.2;
              color: #e5e7eb;
              white-space: nowrap;
              word-break: keep-all;
              overflow-wrap: normal;
            }
            
            h3 {
              font-size: 40px;
              font-weight: 650;
              margin-bottom: 16px;
              line-height: 1.3;
              color: #e2e8f0;
              white-space: nowrap;
              word-break: keep-all;
              overflow-wrap: normal;
            }
            
            p {
              font-size: 32px;
              line-height: 1.4;
              color: #cbd5e1;
              margin-bottom: 12px;
              white-space: nowrap;
              word-break: keep-all;
              overflow-wrap: normal;
            }
            
            strong {
              color: #fe2c55;
              font-weight: 800;
              white-space: nowrap;
            }
            
            em {
              color: #f59e0b;
              font-style: italic;
            }
            
            .highlight {
              color: #fe2c55;
              font-weight: 850;
              white-space: nowrap;
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
            
            .cta {
              color: #fe2c55;
              font-weight: 850;
              white-space: nowrap;
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
