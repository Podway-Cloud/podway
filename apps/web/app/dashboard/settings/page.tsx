import DashboardPage from "@/components/dashboard-page";
import RelayConnectCard from "@/components/relay-connect-card";
import { GithubAccountCard } from "@/components/github-account-card";
import ThemeSwitcher from "@/components/theme-switcher";
import { myRelayLive } from "@/lib/relay-actions";
import { editionOss } from "@/lib/session";
import { Palette } from "lucide-react";

export const dynamic = "force-dynamic";

/** Settings — account-level connections + appearance, each in its own full-width card. Sign out and
 * per-pod actions live elsewhere (the sidebar user menu, the pod cockpit). */
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Self-host: the relay routes egress through podway.cloud's relay authority, which self-host has
  // no part of — and a self-host pod already egresses from the owner's own network. So it's not a
  // thing in OSS; don't show it (nor mint a relay command that can't work).
  const oss = editionOss();
  const relay = oss ? null : await myRelayLive();
  return (
    <DashboardPage title="Settings">
      <div className="space-y-4">
        {!oss && relay && <RelayConnectCard initial={relay} />}
        {/* GitHub is an owner-level connection (one per person, reused by every pod). Cloud-only:
            self-host connects GitHub in-pod per pod. */}
        {!oss && <GithubAccountCard />}

        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-start gap-2.5 px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-border bg-white/[0.04] text-muted-foreground">
              <Palette className="size-[18px]" />
            </span>
            <div>
              <h2 className="text-[15.5px] font-semibold">Appearance</h2>
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">Choose theme</p>
            </div>
          </div>
          <div className="border-t border-border/60 px-5 py-4">
            <ThemeSwitcher />
          </div>
        </section>

      </div>
    </DashboardPage>
  );
}
