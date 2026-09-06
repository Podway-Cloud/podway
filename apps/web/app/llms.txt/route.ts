import { docsSource } from "@/lib/docs-source";

export const dynamic = "force-static";

export function GET() {
  const pages = docsSource
    .getPages()
    .map(
      (page) =>
        `- [${page.data.title}](https://podway.cloud${page.url}): ${page.data.description ?? "Podway documentation."}`,
    )
    .join("\n");

  const body = `# Podway

> Podway gives Claude Code a persistent cloud computer with project files, services, automation, skills, and a live URL.

Use these public docs for product behavior and user-facing instructions. Podway is currently in private alpha, so pages say when a capability is limited or still experimental.

## Documentation

${pages}
`;

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
