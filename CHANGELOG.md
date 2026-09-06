# Changelog

Owner-facing release notes for Podbay pods. Each version corresponds to a **pod-base image ship**
(the release-versioning decision: image-only, per-ship). Write these for the owner — what changed for
them, not the commit log. See [docs/runbooks/release-notes.md](docs/runbooks/release-notes.md).

The format is loosely [Keep a Changelog](https://keepachangelog.com): newest first, grouped
**New / Fixed / Improved**. `scripts/cut-release.sh` reads the section for the version being cut.

## 0.8.0

### Fixed
- **Your pod was stuck on the old instructions.** Pods created before the Podway rename kept reading
  a stale copy of the runtime guide forever — so the agent was still being told to run `podbay …`.
  Your pod now repairs that itself on the next update.
- **A pod could come back with an empty home.** If a pod already had both the old and new state
  folders, the boot migration skipped and left the real one behind — this is what took makore.app
  down. Boot now merges them safely.
- **Reconnecting Claude no longer starts an empty session.** When a pod's login renewed, it opened a
  brand-new session instead of resuming your conversation. It now continues where you left off.
- **Old pods printed dead links.** `info` and `preview` on a pod created before the domain move
  handed you a `podbay.cloud` URL that no longer resolves. Those are repaired automatically.
- Agents no longer learn the old command names — the built-in skills all say `podway`.

### Improved
- Your pod's home volume relabels itself to the Podway name on the next boot, with no downtime and
  no risk to your files.

### Changed
- Finished the internal move to the Podway name (boot components, self-host tooling, docs). Fully
  invisible — your pod boots and behaves exactly as before, and every `podbay` command still works.

## 0.7.0

### Changed
- Internal plumbing finished its move to the Podway name (package + config names). No action for you —
  your pod migrates cleanly and every `podbay` command still works via the compatibility alias.

## 0.6.0

### Changed
- **Podbay is now Podway.** The in-pod command is now `podway` — and your existing `podbay` commands
  still work, they forward automatically, so nothing you've memorized or scripted breaks.
- Your pod's saved state (handoff notes, setup progress, seeded config) **migrates across on this
  update** with nothing for you to do. Same product, same pod, new name.

## 0.5.0

### Fixed
- Setup now really shows live progress while your app deploys ("Pulling n8n…", "Starting the
  database…", "n8n is live") — the previous image carried the label but not the feature.
- Your AI admin runs Docker directly instead of working around a permissions quirk on first boot —
  smoother, more reliable app management (deploys, upgrades, backups).

## 0.4.0

### New
- Self-hosted apps: Docker and n8n are baked into the pod image, so one-click apps (like n8n) run
  right on your pod.
- Live deploy progress: setup now shows live progress while your app deploys.

### Fixed
- Claude sign-in: a setup-token pod now offers "Sign in to your Claude account" to enable Remote
  Control, instead of a stuck restore.
- Mobile: the :3000 auto dev-server is skipped for Expo / React Native projects.

### Improved
- Smaller pod image.

## 0.3.0

### Fixed
- Codex pairing now shows your pod's current name after you rename it, instead of an old name until
  the next restart.
- The "add GitHub to a pod" page recognizes a repo you already have in `~/work` — it says what you're
  working on instead of pushing you to choose one to clone.

## 0.2.0

### Fixed
- Pods that sign in with a long-lived token now start on that token instead of getting stuck at a
  sign-in screen — reconnecting no longer leaves the pod on "sign-in expired".

### Improved
- Claude and Codex are updated to their latest versions.

## 0.1.0

The first named version. Everything before this was identified only by image digest; from here a pod
can tell you what it runs.

### New
- Pods now have a version you can name and quote, shown alongside the build id everywhere the pod's
  image appears.

### Fixed
- A pod that lost remote control after a failed T3 Code setup now heals itself on restart, instead of
  silently never greeting you again.
- A startup command whose folder was deleted now says exactly that, and how to fix it, instead of
  "keeps failing". Removing a startup command clears its error right away.

### Improved
- Update notes are written for people: internal changes and issue numbers are stripped, and changes
  are grouped into New / Fixed / Improved so you can tell a bug fix from a new feature at a glance.
