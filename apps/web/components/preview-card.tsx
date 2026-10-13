"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Eye, Globe, Lock, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyCodeButton } from "@/components/copy-code-button";
import { getPodAppListening } from "@/lib/actions";

/**
 * The pod's live preview, as a browser-window card rather than a lone button in an
 * empty row (owner feedback, 2026-07-29).
 *
 * The frame is a REAL live view, not a screenshot. The preview host (*.podway.site)
 * is a DIFFERENT registrable domain from the dashboard (podway.io), so the frame is
 * cross-site and the owner's session cookie does NOT ride along. For an owner-only
 * preview the frame instead loads a `frameUrl` carrying a one-time `?__pw_t=` bridge
 * token (minted server-side in the cockpit page, which holds the session); the gateway
 * consumes it and sets a host-only Partitioned cookie. A public/self-host preview needs
 * no token and loads the plain URL.
 *
 * Built so the card still reads correctly if the frame never paints (app not
 * started, crashed, still building): the chrome bar carries the URL, the state
 * line says what's expected, and Open is the authoritative action WHEN there is
 * something to open. A blank rectangle should never be the only thing this says —
 * and Open is hidden when nothing is serving, so it never leads to a dead page
 * (matches the dashboard card, which hides its preview button the same way).
 */
// Memoized so switching cockpit tabs (which re-renders the parent) doesn't re-render the preview —
// its own appUp poll + iframe stay put instead of flickering (owner: "rerenders the preview").
/** After a refreshed frame loads, give its page this long to paint before it replaces the shown one. */
const SETTLE_MS = 1500;
const FADE_MS = 300;

function PreviewCard({
  slug,
  url,
  altUrl = null,
  frameUrl = null,
  isPublic,
  running,
}: {
  slug: string;
  url: string;
  /** The preview URL, shown quietly beneath when a custom domain has taken the primary slot. */
  altUrl?: string | null;
  /** The URL the IFRAME loads. For a private cloud preview it carries a one-time `?__pw_t=` bridge
   * token so the cross-site frame authenticates without the blocked third-party session cookie; the
   * visible "Open" link and copy still use the clean `url`. Falls back to `url` when absent. */
  frameUrl?: string | null;
  isPublic: boolean;
  running: boolean;
}) {
  /** null = unknown. The frame is cross-origin, so we can NEVER read its contents to
   * tell "blank" from "a real page" — but the pod knows whether anything is listening
   * on the preview port, which answers the same question honestly. Without it the card
   * had to hedge with a permanent "Blank? maybe…" caption under a perfectly good page. */
  const [appUp, setAppUp] = useState<boolean | null>(null);
  // Refreshes WITHOUT a flash (owner, 2026-10-11). An app can answer on :3000 a beat before its UI finishes
  // its FIRST render (n8n runs DB migrations + serves a briefly blank shell), so a frame loaded then stays
  // stale — hence the auto refreshes at 5 s and 13 s after it comes up (+ a manual Reload). They used to
  // re-key the VISIBLE iframe, so every cockpit open flashed twice. Now a refresh loads into a second,
  // hidden frame; once it has loaded and had SETTLE_MS to paint, it fades in over the old one, which is
  // then dropped. Unchanged page → nothing visible; stale page → it quietly becomes current.
  const [frames, setFrames] = useState<number[]>([0]); // frame ids, oldest first; the LAST loaded one shows
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const nextId = useRef(1);
  // Keep the frame ON SCREEN plus one new loader — never drop what the user is looking at.
  const refresh = () => setFrames(() => [shownRef.current, nextId.current++]);
  const onFrameLoad = (id: number) => {
    if (id === 0) return; // the first frame is visible from the start
    setTimeout(() => {
      if (id < shownRef.current) return; // a newer frame already took over
      shownRef.current = id;
      setShown(id);
      setTimeout(() => setFrames((f) => f.filter((x) => x >= id)), FADE_MS);
    }, SETTLE_MS);
  };
  const cameUp = useRef(false);
  useEffect(() => {
    if (appUp !== true || cameUp.current) return;
    cameUp.current = true;
    const t1 = setTimeout(refresh, 5000);
    const t2 = setTimeout(refresh, 13000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [appUp]);
  // Shown without the scheme: it's the part that identifies the pod, and dropping
  // "https://" buys ~8 characters of a phone's width. Copy still yields the host.
  const host = url.replace(/^https?:\/\//, "");
  // Only offer Open + the live frame once we've CONFIRMED something is listening. We used to be
  // optimistic while liveness was still unknown (`appUp !== false`), which flashed the heavy iframe on
  // every cockpit open and then collapsed it a second later when the probe came back false — bad UX and
  // a wasted full-site render (owner report, 2026-08-26). Now `null` = still checking shows a light
  // placeholder, and the frame renders only when `appUp === true`.
  const showPreview = running && appUp === true;

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const poll = () =>
      void getPodAppListening(slug)
        .then((v) => !stop && setAppUp(v))
        .catch(() => undefined);
    poll();
    const t = setInterval(poll, 15_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug, running]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      {/* Browser chrome. Layout is deliberately different per width:
          desktop  — [visibility] [URL·····························] [Open]
          mobile   — [visibility]                              [Open]
                     [URL·······························································]
          i.e. the URL takes the full width on a phone rather than being squeezed
          between two fixed clusters (which read as three unrelated things stacked
          at odd offsets). `min-w-0` on the URL is what lets it actually ellipsize
          instead of forcing the row wider. Open is dropped entirely when nothing is
          serving, so the row never offers an action that leads nowhere. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {isPublic ? <Eye className="size-3.5" /> : <Lock className="size-3.5" />}
          {isPublic ? "Public" : "Only you"}
        </span>
        {showPreview && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:order-last sm:ml-0">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              aria-label="Reload preview"
              title="Reload the preview"
            >
              <RotateCw />
            </Button>
            <Button asChild size="sm">
              <a href={url} target="_blank" rel="noopener">
                <Globe /> Open <ArrowUpRight />
              </a>
            </Button>
          </div>
        )}
        <CopyCodeButton
          code={host}
          title={altUrl ? "Copy the pod's address" : "Copy the preview URL"}
          className="order-last w-full px-2.5 py-1.5 text-[12.5px] font-normal sm:order-none sm:w-auto sm:min-w-0 sm:flex-1"
        />
      </div>

      {/* When the owner's own domain is live it takes the primary slot above, but the preview URL
          never goes away — it is the address that works regardless of anyone's DNS, so it stays
          reachable rather than being replaced. */}
      {altUrl && (
        <p className="px-3.5 pb-1 text-[12px] text-muted-foreground">
          Also at{" "}
          <a className="underline underline-offset-2 hover:text-foreground" href={altUrl} target="_blank" rel="noopener">
            {altUrl.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}

      {/* All non-iframe states reserve the SAME height as the live frame (h-[220px]/sm:h-[280px]) so
          the preview block never grows when the app finishes loading — that growth used to shove the
          walkthrough coach-mark from the middle of the preview to the bottom, and made the cockpit
          feel laggy (owner report, 2026-09-01). */}
      {!running ? (
        <p className="flex h-[220px] items-center justify-center px-3.5 text-center text-[13px] text-muted-foreground sm:h-[280px]">
          The preview is live while the pod is running.
        </p>
      ) : appUp === null ? (
        // Still checking whether anything is listening. Show a light placeholder — NOT the heavy iframe
        // — so we never flash a full-site render we're about to hide (owner report, 2026-08-26).
        <p className="flex h-[220px] items-center justify-center px-3.5 text-center text-[13px] text-muted-foreground sm:h-[280px]">
          Checking the preview…
        </p>
      ) : appUp === false ? (
        // We KNOW nothing is listening on the app port — don't frame a broken/error page; say so.
        <p className="flex h-[220px] items-center justify-center px-3.5 text-center text-[13px] text-warning sm:h-[280px]">
          Nothing is serving the preview yet — start your app in the pod (e.g. a dev server on port
          3000) and it appears here.
        </p>
      ) : (
        // appUp === true: the LIVE preview, scaled down (owner preference — a live view is more useful
        // than a static thumbnail for now; the pod-side self-screenshot capability stays in place,
        // dormant, for a possible thumbnail return later). pointer-events-none so scrolling the cockpit
        // isn't captured by the frame; the overlay anchor carries the click.
        <div className="relative bg-background">
          <div className="relative h-[220px] overflow-hidden sm:h-[280px]">
            {frames.map((id) => (
              <iframe
                key={id}
                src={frameUrl ?? url}
                title="Pod preview"
                aria-hidden={id !== shown}
                tabIndex={-1}
                onLoad={() => onFrameLoad(id)}
                // Stacked; the shown frame on top at full opacity, a loading one underneath and invisible.
                className={`pointer-events-none absolute left-0 top-0 h-[440px] w-[200%] origin-top-left scale-50 border-0 transition-opacity duration-300 motion-reduce:transition-none sm:h-[560px] ${
                  id === shown ? "z-10 opacity-100" : "z-0 opacity-0"
                }`}
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
              />
            ))}
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener"
            aria-label="Open the preview in a new tab"
            className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>
  );
}

export default memo(PreviewCard);
