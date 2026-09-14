"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Client tab-switcher for the environment marketplace. The grids are rendered on the SERVER
 * (EnvGallery) and passed in as nodes — this component only owns the active-tab state. Workspaces
 * is the default tab. Playbooks are hidden for now (owner call) — only Workspaces + Apps show.
 * Styled like the cockpit's underline tabs (variant="line") but a step larger.
 */
export default function EnvTabs({
  workspaces,
  apps,
}: {
  workspaces: React.ReactNode;
  /** "Apps" — self-hosted OSS apps Podway deploys + maintains for you. Omitted (null) on the self-host
   * edition, where docker-compose apps can't run — the Apps tab is then hidden entirely. */
  apps?: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="workspaces" data-testid="env-gallery">
      <TabsList variant="line" className="mb-1 justify-start gap-7">
        <TabsTrigger value="workspaces" className="flex-none px-0 pb-2 text-[17px]">
          Workspaces
        </TabsTrigger>
        {apps != null && (
          <TabsTrigger value="apps" className="flex-none px-0 pb-2 text-[17px]">
            Apps
          </TabsTrigger>
        )}
      </TabsList>
      <TabsContent value="workspaces" className="pt-5">
        {workspaces}
      </TabsContent>
      {apps != null && (
        <TabsContent value="apps" className="pt-5">
          {apps}
        </TabsContent>
      )}
    </Tabs>
  );
}
