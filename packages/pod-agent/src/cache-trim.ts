import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import type { Logger } from "@podway/shared/log";
import { sessionStateFromDisk } from "./signals.js";

/**
 * Idle guest cache trim (guest-memory-return). A VM keeps every page its guest ever touched; a guest
 * fills free RAM with page cache, so an idle pod still holds its whole size on the box and overcommit
 * fails. When the pod is idle we drop CLEAN page cache and compact, so free-page reporting (set by the
 * provider on the balloon device) hands the memory back. Pilot 2026-09-28: dropping cache alone returned
 * nothing (reporting needs whole 2 MB free blocks); drop + compact returned ~770 MB per small pod.
 */
export const IDLE_MS = 15 * 60_000;
export const MIN_GAP_MS = 60 * 60_000;
export const LOAD_IDLE = 0.3;

export interface TrimState {
  lastBusyAt: number;
  lastTrimAt: number;
}

/** Pure: update the idle clock and say whether to trim now. */
export function shouldTrim(s: TrimState, now: number, busy: boolean, load1: number): boolean {
  if (busy || load1 >= LOAD_IDLE) {
    s.lastBusyAt = now;
    return false;
  }
  return now - s.lastBusyAt >= IDLE_MS && now - s.lastTrimAt >= MIN_GAP_MS;
}

function cachedMb(): number {
  const m = /^Cached:\s+(\d+)/m.exec(readFileSync("/proc/meminfo", "utf8"));
  return m ? Math.round(Number(m[1]) / 1024) : 0;
}

/** Drop clean page cache (1 = page cache only; the kernel never drops dirty data), then compact so the
 * freed pages form whole blocks that free-page reporting returns to the host. Root only. */
export function trimNow(): number {
  const before = cachedMb();
  writeFileSync("/proc/sys/vm/drop_caches", "1");
  writeFileSync("/proc/sys/vm/compact_memory", "1");
  return before - cachedMb();
}

/** Only inside a VM with a virtio balloon (an Incus pod). In a container (self-host) drop_caches would hit
 * the whole HOST — or fail — so never trim there. */
export function inBalloonVm(dir = "/sys/bus/virtio/drivers/virtio_balloon"): boolean {
  return existsSync(dir) && readdirSync(dir).some((f) => f.startsWith("virtio"));
}

export function startCacheTrim(log: Logger, everyMs = 60_000): NodeJS.Timeout | undefined {
  if (!inBalloonVm()) return undefined;
  const s: TrimState = { lastBusyAt: Date.now(), lastTrimAt: 0 };
  return setInterval(() => {
    try {
      const busy = sessionStateFromDisk().status === "busy";
      if (!shouldTrim(s, Date.now(), busy, os.loadavg()[0] ?? 0)) return;
      s.lastTrimAt = Date.now();
      log.info("guest_cache_trimmed", { cacheDroppedMb: trimNow() });
    } catch (e) {
      log.warn("guest_cache_trim_failed", { err: (e as Error).message });
    }
  }, everyMs).unref();
}
