import "server-only";

/** Apps committed + baked but NOT offered (catalog, landing lineup). One list for all. */
export const HIDDEN_APPS = new Set([
  "excalidraw",
  "code-server",
  "it-tools",
  "filebrowser",
  "homepage",
  "wikijs",
  // Not owner-curation: firefly-iii is committed + baked but fails restart-survival on a
  // hard pod reboot (storage-perms corruption). Hidden until fixed + re-smoked. See 0audit.md.
  "firefly-iii",
]);
