import { describe, it, expect } from "vitest";
import { formatDeliveryTurn } from "../src/agent-messaging.js";

const msg = (fromPod: string, id = "m1") => ({
  id,
  fromPod,
  body: "hello",
  createdAt: "2026-09-06T00:00:00.000Z",
});

/**
 * Pods referred to each other by internal slug in the owner's chat — a name they never chose and
 * cannot map to a machine. These pin the fix AND the reason the slug was there: this string is
 * executed in a double-quoted shell context, so an owner-supplied name must never carry shell
 * metacharacters into it.
 */
describe("delivery notice names the sender the way the owner does", () => {
  it("uses the owner's name for the pod", () => {
    const t = formatDeliveryTurn([msg("nursing-gull-2e54")], new Map([["nursing-gull-2e54", "makore.app prod"]]));
    expect(t).toContain("your 'makore.app prod' pod");
    expect(t).not.toContain("nursing-gull-2e54");
  });

  it("falls back to the slug when the pod has no name", () => {
    for (const names of [undefined, new Map([["nursing-gull-2e54", null]])]) {
      expect(formatDeliveryTurn([msg("nursing-gull-2e54")], names as never)).toContain(
        "your 'nursing-gull-2e54' pod",
      );
    }
  });

  it("STRIPS shell metacharacters from a name — this string is shell-executed", () => {
    // The guard the slug was providing. A name is arbitrary owner text; $ ` " ' would expand or
    // break quoting where this lands (tmux send-keys inside a double-quoted context).
    const t = formatDeliveryTurn(
      [msg("p1")],
      new Map([["p1", 'ev"il $(whoami) `id` \'x\' ${HOME}']]),
    );
    for (const ch of ['"', "$", "`", "'", "(", ")", "{", "}"]) {
      // an apostrophe appears in the surrounding template, so check the NAME segment only
      const seg = t.slice(t.indexOf("your '") + 6, t.indexOf("' pod"));
      expect(seg, `metacharacter ${ch} survived in: ${seg}`).not.toContain(ch);
    }
  });

  it("falls back to the slug when a name sanitises to nothing", () => {
    expect(formatDeliveryTurn([msg("p1")], new Map([["p1", "$$$"]]))).toContain("your 'p1' pod");
  });

  it("names every sender when several pods wrote", () => {
    const t = formatDeliveryTurn(
      [msg("a", "1"), msg("b", "2")],
      new Map([
        ["a", "crawler"],
        ["b", "prod"],
      ]),
    );
    expect(t).toContain("crawler");
    expect(t).toContain("prod");
  });

  it("still calls a system notice 'podway', not a pod", () => {
    expect(formatDeliveryTurn([msg("podway")])).toContain("from podway");
  });
});
