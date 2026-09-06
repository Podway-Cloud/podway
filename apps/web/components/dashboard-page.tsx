import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * The one page scaffold every dashboard route renders into, so all pages share
 * the same container width, padding rhythm, and header pattern (back link →
 * title + actions → content). Cards/blocks span the container's full width —
 * this is what keeps the dashboard visually uniform. Don't add per-page
 * max-widths inside it — use `wide` for data-dense backoffice tables instead.
 *
 * ALIGNMENT is centralized here (every dashboard page flows through this one
 * container). Content is LEFT-aligned against the sidebar; flip `CENTERED` to
 * true to restore the previous centered layout across the whole dashboard in
 * one place.
 */
const CENTERED = false;
export default function DashboardPage({
  title,
  intro,
  backHref,
  backLabel,
  actions,
  wide,
  roomy,
  children,
}: {
  /** Page h1. Omit when the page renders its own hero header (e.g. the cockpit). */
  title?: string;
  /** Roomier container for data-dense tables (backoffice pods/users). */
  wide?: boolean;
  /** A middle width for card lists. The default 3xl (768px) left pod cards cramped on desktop —
   * their content is a name, a status chip, agent lines and a row of actions, which wants more room
   * than prose does — while `wide` (6xl) is a table layout and too much for a single column
   * (owner, 2026-09-06). */
  roomy?: boolean;
  /** One-line description under the title. */
  intro?: string;
  backHref?: string;
  backLabel?: string;
  /** Right-aligned header actions (buttons/links). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={`w-full ${wide ? "max-w-6xl" : roomy ? "max-w-5xl" : "max-w-3xl"}${CENTERED ? " mx-auto" : ""}`}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> {backLabel ?? "Back"}
        </Link>
      )}
      {(title || actions) && (
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>}
            {intro && <p className="mt-1 text-sm text-muted-foreground">{intro}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="flex flex-col gap-5">{children}</div>
    </div>
  );
}
