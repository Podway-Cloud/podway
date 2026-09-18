import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DASHBOARD_PROOF_POINTS } from "@/lib/catalog-tags";
import { LANDING_PLAYBOOKS } from "@/lib/landing-playbooks";

const source = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");

describe("dashboard presentation contract", () => {
  it("explains that the catalog creates a pod without making setup promises", () => {
    const page = source("app/dashboard/create/page.tsx");
    expect(page).toContain('title="Create a pod"');
    // Pin the OPENING of the intro, not the whole sentence. The second clause is live marketing
    // copy and has already been reworded once (playbooks -> self-hosted apps); matching the full
    // sentence made this suite go red for a deliberate copy change that broke no contract. What the
    // test actually guards is below: an intro exists, and it promises nothing about setup.
    expect(page).toContain('intro="Start an open-ended workspace for ongoing development,');
    expect(page).not.toContain("agent already signed in");
    expect(page).not.toContain("preview URL live");
  });

  it("uses customer-facing catalog labels and proof instead of internal taxonomy", () => {
    const card = source("components/app-card.tsx");
    // The whole card is the launch target now (no button, no per-card "App"/"Workspace" eyebrow):
    // an overlay link aria-labelled "Launch <title>". That's the customer-facing action; the old
    // "Start playbook" label and the internal App/Workspace taxonomy eyebrow were both retired.
    expect(card).toContain("Launch ${e.title}");
    expect(card).not.toContain('isApp ? "App" : "Workspace"');
    expect(card).not.toContain("Start playbook");
    // Agents are no longer labelled per-card (every env ships Claude + Codex — noise).
    expect(card).not.toContain('e.capability.agents.join(" + ")');
    expect(card).not.toContain("e.title.charAt(0)");
  });

  it("keeps proof chips concise and consistently capitalized", () => {
    for (const [name, points] of Object.entries(DASHBOARD_PROOF_POINTS)) {
      expect(points.length, `${name} has too many proof chips`).toBeLessThanOrEqual(3);
      for (const point of points) {
        expect(point[0], `${name}: ${point}`).toBe(point[0].toUpperCase());
      }
    }
  });

  it("classifies BYO consistently without rewriting frozen landing proof", () => {
    expect(LANDING_PLAYBOOKS["byo-project"].kind).toBe("workspace");
    expect(LANDING_PLAYBOOKS["doc-qa"].kind).toBe("playbook");
    expect(LANDING_PLAYBOOKS["byo-project"].proof).toBe(
      "Repo orientation · verified commands · testing and review skills",
    );
  });

  it("names the pod action and empty state directly", () => {
    const page = source("app/dashboard/page.tsx");
    expect(page).toContain("<Plus");
    expect(page).toContain(">New pod</Link>");
    expect(page).toContain("No pods yet");
    expect(page).toContain("Create your first pod");
    // The dashboard now builds a PodCardProps[] for <PodCardList> (signal-cards refactor), so the
    // env title is an object property, not a JSX prop.
    expect(page).toContain("environmentTitle: environmentTitles.get(p.environmentName)");
    expect(page).not.toContain("agent already in it");
  });

  it("keeps the whole-card link separate from its action buttons", () => {
    const card = source("components/pod-card.tsx");
    expect(card).toContain("environmentTitle: string");
    expect(card).toContain("Update available");
    expect(card).toContain("aria-label={`Open ${display}`}");
    expect(card).not.toContain('role="link"');
    expect(card).not.toContain("tabIndex={0}");
  });

  it("offers one details tab stop per catalog card", () => {
    const card = source("components/app-card.tsx");
    expect(card).not.toContain("aria-label={`View details for ${e.title}`}");
    // The name is the card's title heading (and links to the app's site when set).
    expect(card).toContain("{e.title}");
  });

  it("states slot usage and the support action explicitly", () => {
    const meter = source("components/slot-meter.tsx");
    expect(meter).toContain("{used} of {cap}");
    expect(meter).toContain("slots used");
    expect(meter).toContain("Request more slots");
    expect(meter).not.toContain("Need more?");
  });

  it("keeps the BYO repository step compact and free of repeated guidance", () => {
    const launch = source("components/launch-configure.tsx");
    const repository = source("components/github-repo-field.tsx");
    const picker = source("components/repo-picker.tsx");

    expect(launch).toContain("{STEP_LABELS[step]}");
    expect(launch).toContain("{idx + 1} / {steps.length}");
    expect(launch).not.toContain("Step {idx + 1} of {steps.length} — {STEP_LABELS[step]}");
    expect(launch).not.toContain("<Label>Repository</Label>");
    expect(launch).not.toContain("The repo to work on");

    expect(repository).toContain("Repository");
    expect(repository).toContain('placeholder="Search repositories…"');
    expect(repository).not.toContain("Your repository");
    expect(repository).not.toContain("— required");
    expect(repository).not.toContain("Connected as");
    expect(repository).not.toContain("Cloned into ~/work. Your agent starts by orienting in it.");
    expect(repository).not.toContain('className="flex flex-col gap-2 rounded-lg border p-3.5"');
    expect(repository).toContain('id="github-repository-label"');
    expect(repository).toContain('htmlFor="github-repository-picker"');
    expect(repository).toContain('<span className="sr-only"> required</span>');
    expect(repository).toContain('<span aria-hidden className="text-destructive">*</span>');
    expect(picker).toContain("id={triggerId}");
    expect(picker).toContain("aria-labelledby={labelledBy}");
    expect(picker).toContain("aria-describedby={valueId}");
  });
});
