"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useState } from "react";

/**
 * A product screenshot the visitor can inspect: renders the image inline, and on click opens
 * a full-screen dark overlay. In the overlay it fits to the screen by default; a tap/click
 * toggles to full resolution with scroll + native pinch-zoom to pan around the detail. Esc,
 * the ✕, or a click on the backdrop closes it; body scroll is locked while open.
 */
export default function ImageLightbox({
  src,
  alt,
  className,
  sizes,
  priority,
}: {
  src: StaticImageData;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setZoomed(false);
          setOpen(true);
        }}
        aria-label="Enlarge dashboard screenshot"
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          margin: 0,
          border: "none",
          background: "none",
          cursor: "zoom-in",
        }}
      >
        <Image className={className} src={src} alt={alt} sizes={sizes} priority={priority} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            background: "rgba(6,9,13,0.92)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            overscrollBehavior: "contain",
            padding: "clamp(12px, 3vw, 40px)",
          }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            style={{
              position: "fixed",
              top: 14,
              right: 16,
              zIndex: 101,
              width: 40,
              height: 40,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              fontSize: 20,
              lineHeight: 1,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src.src}
            alt={alt}
            onClick={(e) => {
              e.stopPropagation();
              setZoomed((z) => !z);
            }}
            style={{
              display: "block",
              borderRadius: 12,
              boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
              cursor: zoomed ? "zoom-out" : "zoom-in",
              width: zoomed ? "auto" : "min(1400px, 100%)",
              maxWidth: zoomed ? "none" : "100%",
              height: "auto",
              margin: "auto",
              touchAction: "pinch-zoom",
            }}
          />
        </div>
      )}
    </>
  );
}
