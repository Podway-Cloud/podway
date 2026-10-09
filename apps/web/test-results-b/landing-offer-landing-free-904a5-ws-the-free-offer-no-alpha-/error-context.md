# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing-offer.spec.ts >> landing free offer + removed pages >> /pricing is gone (redirects to the landing pricing); the landing shows the free offer, no 'alpha'
- Location: e2e/landing-offer.spec.ts:4:7

# Error details

```
Error: page.goto: net::ERR_ABORTED at http://localhost:3211/selfhost
Call log:
  - navigating to "http://localhost:3211/selfhost", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("landing free offer + removed pages", () => {
  4  |   test("/pricing is gone (redirects to the landing pricing); the landing shows the free offer, no 'alpha'", async ({ page }) => {
  5  |     await page.goto("/pricing");
  6  |     await expect(page).toHaveURL(/\/#pricing$/);
> 7  |     await page.goto("/selfhost");
     |                ^ Error: page.goto: net::ERR_ABORTED at http://localhost:3211/selfhost
  8  |     await expect(page.getByText("Your first app is free during early access. No card needed.")).toBeVisible();
  9  |     await expect(page.getByRole("link", { name: "Start free" }).first()).toBeVisible();
  10 |     await expect(page.getByText(/alpha/i)).toHaveCount(0);
  11 |     await page.setViewportSize({ width: 390, height: 844 });
  12 |     await page.screenshot({ path: "test-results/landing-mobile.png" });
  13 |     await page.setViewportSize({ width: 1280, height: 800 });
  14 |     await page.screenshot({ path: "test-results/landing-desktop.png" });
  15 |   });
  16 | 
  17 |   test("/apps and /radar are removed (owner, 2026-10-08) and redirect to the landing", async ({ page }) => {
  18 |     await page.goto("/apps/umami");
  19 |     await expect(page).toHaveURL(/\/#apps$/);
  20 |     await page.goto("/radar");
  21 |     await expect(page).toHaveURL(/\/$/);
  22 |   });
  23 | });
  24 | 
```