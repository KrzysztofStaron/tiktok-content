"use client";

import React, { forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SlideFrameProps {
  markdown: string;
}

export const SlideFrame = forwardRef<HTMLDivElement, SlideFrameProps>(({ markdown }, ref) => {
  return (
    <div
      ref={ref}
      className="relative w-[1080px] h-[1920px] bg-gray-50 text-gray-900 overflow-hidden rounded-xl border border-gray-200"
      style={{ boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)" }}
    >
      <article className="relative z-10 flex h-full w-full items-center justify-center p-16">
        <div className="prose prose-lg max-w-none text-gray-900">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              img({ node, ...props }) {
                const src = String((props as any).src || "").trim();
                const isHttp = /^https?:\/\//i.test(src);
                if (isHttp) {
                  // eslint-disable-next-line @next/next/no-img-element
                  return (
                    <img
                      {...props}
                      crossOrigin="anonymous"
                      className="mx-auto my-4 max-h-[70vh] w-full rounded-md object-contain"
                      alt={(props.alt as string) || "slide image"}
                    />
                  );
                }
                // Render a descriptive placeholder card when src is a description, not a URL
                return (
                  <figure className="mx-auto my-4 flex max-h-[70vh] w-full items-center justify-center rounded-md border border-gray-300 bg-gray-100 p-6 text-center">
                    <figcaption className="text-sm text-gray-600">
                      <strong>{(props.alt as string) || "Image"}:</strong> {src || "(no description)"}
                    </figcaption>
                  </figure>
                );
              },
              h1({ node, ...props }) {
                return (
                  <h1 {...props} className="text-balance text-gray-900 font-bold">
                    {props.children}
                  </h1>
                );
              },
              h2({ node, ...props }) {
                return (
                  <h2 {...props} className="text-balance text-gray-800 font-semibold">
                    {props.children}
                  </h2>
                );
              },
              p({ node, ...props }) {
                return (
                  <p {...props} className="text-balance text-gray-700">
                    {props.children}
                  </p>
                );
              },
            }}
          >
            {markdown}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
});

SlideFrame.displayName = "SlideFrame";
