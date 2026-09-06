import { Check } from "lucide-react";

/**
 * The canonical "✓ @username" inline unit shown wherever we say a GitHub account is
 * connected (wizard, account card, settings row). Rendered as INLINE text (not
 * inline-flex) with a baseline-nudged check, so it sits on the SAME line as the
 * surrounding sentence — an inline-flex wrapper was lifting the check + handle off
 * the text baseline (owner report). The handle is bold + foreground to stand out.
 */
export function GithubHandle({ login }: { login: string }) {
  return (
    <span className="font-semibold whitespace-nowrap text-foreground">
      <Check className="inline size-3.5 align-[-0.15em] text-success" aria-hidden /> @{login}
    </span>
  );
}
