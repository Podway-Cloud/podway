"use client";

import { useEffect, useRef, useState } from "react";
import { AgentLogo } from "@/components/agent-logo";
import { sceneFrameAt } from "./selfhost-conversation-timing";
import styles from "./selfhost-landing.module.css";

/** Real jobs people hand their AI admin — one app per scene (owner-picked script, 2026-10-08). The app is
 * already installed in the pod, so nobody asks to "deploy" it. Plain words, no jargon. */
const SCENES = [
  {
    app: "Uptime Kuma",
    logo: "/selfhost-apps/uptime-kuma.svg",
    you: "Watch our site and the checkout API. Tell me if either goes down.",
    admin: "Done: two monitors, checked every minute. Do you want alerts by email, Slack or Telegram?",
  },
  {
    app: "n8n",
    logo: "/selfhost-apps/n8n.svg",
    you: "Every morning, post yesterday's Stripe payments to #sales on Slack.",
    admin: "Built it. It runs every day at 8:00. Add your Stripe key in the Secrets tab and I'll do a test run.",
  },
  {
    app: "Ghost",
    logo: "/selfhost-apps/ghost.png",
    you: "Ghost 6 is out. Can we upgrade?",
    admin: "I took a snapshot, then upgraded. Your theme broke on 6.0, so I rolled back. The site is up and nothing was lost. Fix the theme first?",
  },
] as const;

const LENGTHS = SCENES.map((s) => ({ you: s.you.length, admin: s.admin.length }));

export default function SelfhostConversation() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Loop while the panel is on screen; pause (and keep the place) when it scrolls away.
  useEffect(() => {
    if (reducedMotion) return;
    const panel = panelRef.current;
    if (!panel) return;
    let interval: number | undefined;
    let base = 0;
    const play = () => {
      if (interval !== undefined) return;
      const startedAt = performance.now() - base;
      interval = window.setInterval(() => setElapsedMs((base = performance.now() - startedAt)), 32);
    };
    const pause = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    if (typeof IntersectionObserver === "undefined") {
      play();
      return pause;
    }
    const observer = new IntersectionObserver(([entry]) => (entry?.isIntersecting ? play() : pause()), { threshold: 0.25 });
    observer.observe(panel);
    return () => {
      observer.disconnect();
      pause();
    };
  }, [reducedMotion]);

  const f = sceneFrameAt(elapsedMs, LENGTHS, reducedMotion);
  const scene = SCENES[f.scene]!;
  const typingYou = f.youChars < scene.you.length;
  const typingAdmin = !typingYou && !f.thinking && f.adminChars < scene.admin.length;

  return (
    <div
      ref={panelRef}
      className={styles.term}
      role="img"
      aria-label={`Example conversations in Claude. ${SCENES.map((s) => `${s.app}: you ask "${s.you}" and the AI admin answers "${s.admin}"`).join(" ")}`}
    >
      <div className={styles.termBar}>
        <AgentLogo agent="claude-code" className={styles.claudeMark} />
        <span>example conversations · in Claude</span>
      </div>
      <div className={`${styles.termBody} ${f.fading ? styles.sceneFade : ""}`} aria-hidden="true">
        <p className={styles.sceneApp}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.logo} alt="" width={18} height={18} />
          {scene.app}
        </p>
        {f.youChars > 0 && (
          <p className={`${styles.you} ${typingYou ? styles.typingCursor : ""}`}>{scene.you.slice(0, f.youChars)}</p>
        )}
        {f.thinking && (
          <p className={`${styles.adm} ${styles.thinking}`}><span /><span /><span /></p>
        )}
        {f.adminChars > 0 && (
          <p className={`${styles.adm} ${typingAdmin ? styles.typingCursor : ""}`}>{scene.admin.slice(0, f.adminChars)}</p>
        )}
      </div>
      <noscript>
        {SCENES.map((s) => (
          <p key={s.app}>{s.app} — {s.you} · {s.admin}</p>
        ))}
      </noscript>
    </div>
  );
}
