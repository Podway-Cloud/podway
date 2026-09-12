import { notFound } from "next/navigation";
import DashboardPage from "@/components/dashboard-page";
import ExperimentsPanel from "@/components/experiments-panel";
import { editionOss } from "@/lib/session";
import { getPanelData } from "@/lib/landing-experiment-store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Experiments" };

export default async function ExperimentsPage() {
  // Cloud-only operator surface — self-host has no marketing landing to experiment on.
  if (editionOss()) notFound();
  const data = await getPanelData();
  if (!data) notFound();
  const running = data.status === "active";
  return (
    <DashboardPage
      title="Landing experiments"
      intro="Choose what serves /, run the A/B test, and promote a winner."
      wide
      actions={
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
            running
              ? "border-success/40 bg-success/10 text-success"
              : "border-border bg-muted text-muted-foreground"
          }`}
        >
          {running ? "Running" : "Stopped"}
        </span>
      }
    >
      <ExperimentsPanel data={data} />
    </DashboardPage>
  );
}
