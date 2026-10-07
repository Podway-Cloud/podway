"use client";

import { useEffect, useRef, useState } from "react";
import { AgentLogo } from "@/components/agent-logo";
import { conversationFrameAt, MESSAGE_TIMING } from "./selfhost-conversation-timing";
import styles from "./selfhost-landing.module.css";

const MESSAGES = [
  { role: "you", parts: [{ text: "deploy n8n for me" }] },
  {
    role: "admin",
    parts: [
      { text: "on it. " },
      { text: "✓ live", tone: "ok" },
      { text: " at n8n-acme.podway.site. n8n and Postgres are up; first snapshot taken." },
    ],
  },
  { role: "you", parts: [{ text: "upgrade it when safe" }] },
  {
    role: "admin",
    parts: [
      { text: "snapshot taken. the new version " },
      { text: "failed its health check", tone: "warn" },
      { text: ". restored the previous version and data. " },
      { text: "✓ rolled back", tone: "ok" },
    ],
  },
] as const;

const MESSAGE_LENGTHS = MESSAGES.map((message) => message.parts.reduce((sum, part) => sum + part.text.length, 0));
const LAST_FRAME_MS = Math.max(...MESSAGE_TIMING.map((timing, index) => timing.startsAt + MESSAGE_LENGTHS[index] * timing.msPerChar)) + 100;

export default function SelfhostConversation() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const panel = panelRef.current;
    if (!panel) return;

    let interval: number | undefined;
    let observer: IntersectionObserver | undefined;
    const start = () => {
      if (interval !== undefined) return;
      const startedAt = performance.now();
      setElapsedMs(0);
      interval = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        setElapsedMs(Math.min(elapsed, LAST_FRAME_MS));
        if (elapsed >= LAST_FRAME_MS) window.clearInterval(interval);
      }, 32);
      observer?.disconnect();
    };

    if (typeof IntersectionObserver === "undefined") {
      start();
    } else {
      observer = new IntersectionObserver(([entry]) => {
        if (entry?.isIntersecting) start();
      }, { threshold: 0.25 });
      observer.observe(panel);
    }
    return () => {
      observer?.disconnect();
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [reducedMotion]);

  const frame = conversationFrameAt(elapsedMs ?? 0, MESSAGE_LENGTHS, reducedMotion);

  return (
    <div
      ref={panelRef}
      className={styles.term}
      role="img"
      aria-label="Example conversations in Claude: ask the AI admin to deploy n8n, then to upgrade it safely. The upgrade fails its health check, so the admin restores the previous version and data."
    >
      <div className={styles.termBar}>
        <AgentLogo agent="claude-code" className={styles.claudeMark} />
        <span>example conversations · in Claude</span>
      </div>
      <div className={styles.termBody} aria-hidden="true">
        {MESSAGES.map((message, index) => {
          const started = reducedMotion || (elapsedMs !== null && elapsedMs >= MESSAGE_TIMING[index].startsAt);
          if (!started && frame.thinking !== index) return null;
          if (frame.thinking === index) {
            return <p key={index} className={`${styles.adm} ${styles.thinking}`}><span /><span /><span /></p>;
          }

          const isTyping = frame.chars[index] < MESSAGE_LENGTHS[index];
          return (
            <p key={index} className={`${message.role === "you" ? styles.you : styles.adm} ${isTyping ? styles.typingCursor : ""}`}>
              {message.parts.map((part, partIndex) => {
                const preceding = message.parts.slice(0, partIndex).reduce((sum, previous) => sum + previous.text.length, 0);
                const visibleText = part.text.slice(0, Math.max(0, frame.chars[index] - preceding));
                return <span key={partIndex} className={"tone" in part ? (part.tone === "ok" ? styles.ok : styles.warn) : undefined}>{visibleText}</span>;
              })}
            </p>
          );
        })}
      </div>
      <noscript>
        <p>deploy n8n for me · on it. n8n is live and backed up. · upgrade it when safe · the upgrade failed its health check, so the previous version and data were restored.</p>
      </noscript>
    </div>
  );
}
