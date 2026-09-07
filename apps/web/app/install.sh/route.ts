/**
 * Vanity self-host install endpoint: `curl -fsSL podway.io/install.sh | sh`.
 *
 * podway.IO — the PRODUCT domain, the one a human types. podway.cloud also resolves here, but only
 * because its apex redirects; documenting that one made the install command depend on a redirect
 * (owner, 2026-09-07: "podway.cloud/install.sh is WRONG, should be podway.io/install.sh"). Same
 * class as the cockpit links that pointed at the infrastructure domain: right by luck, not design.
 *
 * Redirects to the canonical installer in the Podway-Cloud/podway source mirror (selfhost/install.sh)
 * — ONE source of truth, so
 * the script can't drift from a copy pasted into the web app. `curl -fsSL` follows the redirect
 * (`-L`) and pipes the script to the shell, exactly as the longer raw.githubusercontent one-liner
 * did before this shortcut existed.
 */

export const dynamic = "force-static";

const INSTALL_SCRIPT_URL =
  "https://raw.githubusercontent.com/Podway-Cloud/podway/main/selfhost/install.sh";

export function GET() {
  return Response.redirect(INSTALL_SCRIPT_URL, 302);
}
