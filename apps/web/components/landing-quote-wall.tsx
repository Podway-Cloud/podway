"use client";

import { useEffect, useRef } from "react";
import styles from "./landing-quote-wall.module.css";

/**
 * "The industry already agrees" — a social-proof quote wall for the landing (podway GTM brief,
 * 2026-09-22). Two rows auto-scroll opposite directions; hovering pauses; pointer-drag / touch-swipe
 * scrubs; a drag never opens a link; `prefers-reduced-motion` holds it still and lets people scroll
 * the rows by hand. FRAMING: this is industry consensus on the CONCEPT — not an endorsement of podway.
 * Quotes are VERBATIM; the two marked ✂ are exact trims of the source. Each card links to its source.
 */

type Quote = { quote: string; company: string; role: string; href: string; mark: string };

// Verbatim quotes from the brief. `mark` is the company logo file under /public/quote-logos.
const QUOTES: Quote[] = [
  {
    quote:
      "The most capable agents have something simple in common: they are given their own computer to work with.",
    company: "Cloudflare",
    role: "“Your agent needs a computer, not a container”",
    href: "https://blog.cloudflare.com/cloudflare-computer/",
    mark: "cloudflare.png",
  },
  {
    quote:
      "Giving Claude a computer unlocks the ability to build agents that are more effective than before.",
    company: "Anthropic",
    role: "Claude Agent SDK",
    href: "https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk",
    mark: "anthropic.png",
  },
  {
    quote: "What the agent actually needs is its own computer, not a corner of a shared one.",
    company: "Fly.io",
    role: "“Agents need their own computer”",
    href: "https://fly.io/agents-need-a-computer/",
    mark: "fly.png",
  },
  {
    quote: "An agent needs its own machine … just as a person needs a laptop or a terminal.",
    company: "E2B",
    role: "“Give every agent a machine”",
    href: "https://e2b.dev/about",
    mark: "e2b.png",
  },
  {
    quote: "Powerful agents need persistent environments.",
    company: "Factory",
    role: "Droid Computers",
    href: "https://factory.com/news/droid-computers",
    mark: "factory.png",
  },
  {
    quote:
      "Every agent needs a box — now one of the single hottest areas in AI infrastructure, growing 100% month over month.",
    company: "swyx",
    role: "Latent Space",
    href: "https://www.latent.space/p/box",
    mark: "latentspace.png",
  },
  {
    quote:
      "Sandboxes for AI agents are not just nice to have, but key to unlocking the potential of agents.",
    company: "Daytona",
    role: "AI runtimes",
    href: "https://www.daytona.io/dotfiles/from-dev-environments-to-ai-runtimes",
    mark: "daytona.png",
  },
  {
    quote:
      "How can we expect AI agents to do the same work as humans if we can’t give them the same environment?",
    company: "Vasek Mlejnsky",
    role: "CEO, E2B",
    href: "https://siliconangle.com/2025/07/28/e2b-shares-vision-sandboxed-cloud-environments-every-ai-agent-raising-21m-funding/",
    mark: "e2b.png",
  },
];

function Card({ q }: { q: Quote }) {
  return (
    <div className={styles.card}>
      <p className={styles.quote}>{q.quote}</p>
      <hr className={styles.divider} />
      <a
        className={styles.attr}
        href={q.href}
        target="_blank"
        rel="noopener noreferrer"
        // A drag that ends on a card must not open the link (set by the row's pointer handler).
        onClick={(e) => {
          const row = e.currentTarget.closest("[data-dragged]") as HTMLElement | null;
          if (row?.dataset.dragged === "1") e.preventDefault();
        }}
      >
        <span className={styles.company}>
          <img className={styles.mark} src={`/quote-logos/${q.mark}`} alt="" aria-hidden width={22} height={22} />
          {q.company}
        </span>
        <span className={styles.role}>{q.role}</span>
      </a>
    </div>
  );
}

/** One auto-scrolling row — a NATIVE horizontal scroller so trackpad, touch, and a mouse drag all
 * scroll it by hand. Items are rendered twice for a seamless loop; auto-scroll advances scrollLeft and
 * wraps within one copy. Hovering (or dragging) pauses the auto-scroll so manual scrolling takes over.
 * `dir` gives the two rows opposite directions. */
function Row({ items, dir }: { items: Quote[]; dir: -1 | 1 }) {
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const half = () => row.scrollWidth / 2; // one copy's width (items rendered twice)
    // Keep a value inside [0, half): scrollLeft x and x+half show identical content, so wrapping
    // there is seamless. Note the browser CLAMPS scrollLeft at 0, so the leftward wrap must fire at
    // <= 0, not < 0 (which the clamp makes unreachable).
    const norm = (v: number) => {
      const h = half();
      if (v >= h) return v - h;
      if (v <= 0) return v + h;
      return v;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // static, still hand-scrollable

    const SPEED = 0.5; // px/frame (~30px/s), per the brief
    let paused = false;
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;
    let raf = 0;
    // scrollLeft rounds sub-pixel writes to an integer, so `scrollLeft += 0.5` never accumulates —
    // it reads back 0 every frame. Drive a float accumulator instead and assign it each tick.
    let pos = row.scrollLeft || 0;

    const tick = () => {
      if (paused || dragging) {
        pos = row.scrollLeft; // user is in control (hover-scroll or drag); stay synced
      } else {
        pos = norm(pos + dir * SPEED);
        row.scrollLeft = pos;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onEnter = () => (paused = true);
    const onLeave = () => (paused = false);
    // Mouse users get drag-to-scroll; trackpad/touch already scroll the native overflow row.
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = row.scrollLeft;
      row.dataset.dragged = "0";
      row.setPointerCapture?.(e.pointerId);
      row.classList.add(styles.dragging);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 6) {
        moved = true;
        row.dataset.dragged = "1";
      }
      row.scrollLeft = startScroll - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      row.releasePointerCapture?.(e.pointerId);
      row.classList.remove(styles.dragging);
      // clear the drag flag after the click that follows pointerup, so a drag never opens a link.
      setTimeout(() => {
        if (!moved) row.dataset.dragged = "0";
      }, 0);
    };

    row.addEventListener("pointerenter", onEnter);
    row.addEventListener("pointerleave", onLeave);
    row.addEventListener("pointerdown", onDown);
    row.addEventListener("pointermove", onMove);
    row.addEventListener("pointerup", onUp);
    row.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(raf);
      row.removeEventListener("pointerenter", onEnter);
      row.removeEventListener("pointerleave", onLeave);
      row.removeEventListener("pointerdown", onDown);
      row.removeEventListener("pointermove", onMove);
      row.removeEventListener("pointerup", onUp);
      row.removeEventListener("pointercancel", onUp);
    };
  }, [dir]);

  return (
    <div className={styles.row} ref={rowRef} data-dragged="0">
      <div className={styles.track}>
        {[...items, ...items].map((q, i) => (
          <Card key={`${q.company}-${i}`} q={q} />
        ))}
      </div>
    </div>
  );
}

export default function QuoteWall() {
  const rowA = QUOTES.slice(0, 4);
  const rowB = QUOTES.slice(4);
  return (
    <section className={styles.section} aria-labelledby="quote-wall-title">
      <div className={styles.head}>
        <p className={styles.eyebrow}>The industry already agrees</p>
        <h2 id="quote-wall-title" className={styles.headline}>
          Your agent is only as good as the <em>computer</em> you give it.
        </h2>
      </div>
      <div className={styles.rows}>
        <Row items={rowA} dir={-1} />
        <Row items={rowB} dir={1} />
      </div>
    </section>
  );
}
