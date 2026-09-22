import { type ReactNode } from "react";
import styles from "./landing-agent.module.css";

/**
 * The ONE section primitive for the landing. Every section renders through this so behaviour is
 * genuinely uniform: a full-bleed top divider, one vertical rhythm (the heading sits directly under
 * the divider; the big space is BELOW, before the next divider), and the same `.shell` container so
 * every section's content aligns to the same gutter. Content is passed as children (each section keeps
 * its own inner layout); `bleed` renders edge-to-edge content outside the shell (e.g. a marquee).
 */
export function LandingSection({
  id,
  className,
  ariaLabel,
  children,
  bleed,
}: {
  id?: string;
  className?: string;
  ariaLabel?: string;
  children?: ReactNode;
  bleed?: ReactNode;
}) {
  return (
    <section id={id} aria-label={ariaLabel} className={`${styles.section} ${className ?? ""}`}>
      <div className={styles.shell}>{children}</div>
      {bleed}
    </section>
  );
}
