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
              background: black;
              color: white;
              font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              background-image: 
                linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px);
              background-size: 40px 40px;
              /* Offset the grid so it doesn't draw a line on the top/left edges */
              background-position: 25px 25px;
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
              font-weight: bold;
              margin-bottom: 2rem;
              line-height: 1.1;
              background: linear-gradient(45deg, #8b5cf6, #ec4899);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            
            h2 {
              font-size: 48px;
              font-weight: 600;
              margin-bottom: 1.5rem;
              line-height: 1.2;
              color: #fbbf24;
            }
            
            h3 {
              font-size: 40px;
              font-weight: 600;
              margin-bottom: 1rem;
              line-height: 1.3;
              color: #34d399;
            }
            
            p {
              font-size: 32px;
              line-height: 1.4;
              color: #d1d5db;
              margin-bottom: 1rem;
            }
            
            strong {
              color: #f472b6;
              font-weight: 700;
            }
            
            em {
              color: #a78bfa;
              font-style: italic;
            }
            
            .highlight {
              background: linear-gradient(45deg, #10b981, #3b82f6);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              font-weight: bold;
            }
            
            .image-placeholder {
              width: 600px;
              height: 300px;
              background: linear-gradient(135deg, #374151, #6b7280);
              border: 3px solid #9ca3af;
              border-radius: 16px;
              margin: 2rem auto;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #d1d5db;
              font-size: 1.5rem;
            }
            
            .cta {
              background: linear-gradient(45deg, #f59e0b, #ef4444);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
              font-weight: bold;
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
