/**
 * Vanity self-host install endpoint: `curl -fsSL podway.cloud/install.sh | sh`.
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
