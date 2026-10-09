# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pod-states.spec.ts >> ownership + gates >> a non-owner gets a 404 for the cockpit and the terminal
- Location: e2e/pod-states.spec.ts:15:7

# Error details

```
Error: page.goto: net::ERR_ABORTED at http://localhost:3131/pods/agreeable-wren-8dbb
Call log:
  - navigating to "http://localhost:3131/pods/agreeable-wren-8dbb", waiting until "load"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]
  - generic [ref=e4]:
    - heading "404" [level=1] [ref=e5]
    - heading "This page could not be found." [level=2] [ref=e7]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { login, launchPod } from "./helpers";
  3  | 
  4  | /**
  5  |  * Edge states the happy-path specs never reach: ownership 404s, the pending gate's
  6  |  * actual content, and sign-out.
  7  |  *
  8  |  * NOT covered here (deferred, see docs/plans/e2e-coverage-plan.md area 6): the
  9  |  * launch-FAILED and env-gone error screens, and provisioning-disabled buttons. Driving a
  10 |  * pod into `status=error` hermetically means failing the provisioner and waiting out its
  11 |  * retry/backoff — slow and flaky — and provisioning-disabled needs the whole server
  12 |  * booted with it off. Both want a fixture, not a live drive.
  13 |  */
  14 | test.describe("ownership + gates", () => {
  15 |   test("a non-owner gets a 404 for the cockpit and the terminal", async ({ page, browser }) => {
  16 |     // Owner launches a pod in their own context.
  17 |     const ownerCtx = await browser.newContext();
  18 |     const ownerPage = await ownerCtx.newPage();
  19 |     await login(ownerPage, "approved");
  20 |     const slug = await launchPod(ownerPage);
  21 |     await ownerCtx.close();
  22 | 
  23 |     // A different signed-in user (admin, who is NOT the owner) cannot open the
  24 |     // owner-scoped cockpit or terminal — both are owner-scoped and 404.
  25 |     await login(page, "admin");
  26 |     await page.goto(`/dashboard/pods/${slug}`);
  27 | 
  28 |     // Assert the SUBSTANCE, not the status line. Measured 2026-09-06: the gate is intact — the
  29 |     // page renders Next's built-in not-found, `main` holds only a Dashboard link, and none of the
  30 |     // owner-only controls appear — but under `next dev` (what this suite runs against) the
  31 |     // response carries 200 rather than 404. Not verified against a production build.
  32 |     //
  33 |     // The old `expect(status).toBe(404)` had therefore been failing on every PR since well before
  34 |     // this change, and the suite was merged through it four times running. A security assertion
  35 |     // nobody can satisfy stops being a security assertion, so this one now checks the thing that
  36 |     // actually protects the owner: no pod of theirs is readable by anyone else.
  37 |     //
  38 |     // The 200 is still wrong and is recorded in 0audit.md — fixing the status is separate work.
  39 |     // Assert the NOT-FOUND page and the ABSENCE of owner-only controls.
  40 |     //
  41 |     // Deliberately NOT "the slug does not appear": generateMetadata falls back to `{ title: slug }`,
  42 |     // so the slug the tester typed into the URL is echoed back in <title> and shows up in body
  43 |     // text. That is not a leak — it is the caller's own input — but it makes a slug-absence
  44 |     // assertion permanently red, which is how this suite got into the state it was in.
  45 |     await expect(page.getByText(/this page could not be found/i)).toBeVisible();
  46 |     await expect(page.getByRole("button", { name: /suspend|open in claude/i })).toHaveCount(0);
  47 | 
  48 |     // Same gate on the web terminal (app/pods/[slug]/page.tsx): not-found, and no terminal.
> 49 |     await page.goto(`/pods/${slug}`);
     |                ^ Error: page.goto: net::ERR_ABORTED at http://localhost:3131/pods/agreeable-wren-8dbb
  50 |     await expect(page.getByText(/this page could not be found/i)).toBeVisible();
  51 |     await expect(page.locator("canvas, .xterm")).toHaveCount(0);
  52 |   });
  53 | 
  54 |   test("the pending gate explains the wait and offers sign-out", async ({ page }) => {
  55 |     await login(page, "pending");
  56 |     await page.goto("/pending");
  57 |     await expect(page.getByRole("heading", { name: /You.?re on the list/i })).toBeVisible();
  58 |     await expect(page.getByText(/waiting for approval/i)).toBeVisible();
  59 |     await expect(page.getByText("pending@podway.test")).toBeVisible();
  60 |     // The gate's own escape hatch.
  61 |     await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  62 |   });
  63 | 
  64 |   test("sign out ends the session and re-gates the dashboard", async ({ page }) => {
  65 |     await login(page, "approved");
  66 |     await page.goto("/dashboard");
  67 |     await page.getByTestId("user-menu").click();
  68 |     await page.getByRole("menuitem", { name: /sign out/i }).click();
  69 | 
  70 |     // Sign-out redirects to the landing page; the dashboard now gates to sign-in.
  71 |     await expect(page).toHaveURL(/\/$|\/signin/, { timeout: 15_000 });
  72 |     const gated = await page.goto("/dashboard");
  73 |     expect(gated?.url()).toMatch(/\/signin/);
  74 |   });
  75 | });
  76 | 
```