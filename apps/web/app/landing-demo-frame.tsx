"use client";

import { useEffect, useRef } from "react";

/** The "Commute" demo film in a same-origin frame, sized to the film's own content height so it never
 * needs an inner scrollbar — text wraps more on narrow phones, so a fixed height cannot fit every width. */
export default function LandingDemoFrame({ className }: { className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measure the film's own box, NOT documentElement.scrollHeight: inside a frame that is never less than
    // the frame's current height, so the frame could only grow — it left a ~600 px gap under the film.
    const fit = () => {
      const h = el.contentDocument?.querySelector(".wrap")?.getBoundingClientRect().height;
      if (h) el.style.height = `${Math.ceil(h)}px`;
    };
    el.addEventListener("load", fit);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      el.removeEventListener("load", fit);
      window.removeEventListener("resize", fit);
    };
  }, []);
  return (
    <iframe
      ref={ref}
      className={className}
      src="/landing/commute-demo.html"
      title="Podway demo: start at your desk, continue from your phone"
      loading="lazy"
    />
  );
}
