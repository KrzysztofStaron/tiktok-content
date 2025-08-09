"use client";

import React, { forwardRef } from "react";

interface SlideHTMLProps {
  html: string;
}

export const SlideHTML = forwardRef<HTMLDivElement, SlideHTMLProps>(({ html }, ref) => {
  return (
    <div
      ref={ref}
      className="relative w-[1080px] h-[1920px] bg-black text-white overflow-hidden flex items-center justify-center"
      style={{
        backgroundImage: `
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
        backgroundSize: "40px 40px",
      }}
    >
      <div className="w-full h-full flex items-center justify-center p-16" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
});

SlideHTML.displayName = "SlideHTML";
