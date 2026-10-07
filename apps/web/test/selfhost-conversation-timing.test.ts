import { describe, expect, it } from "vitest";
import { conversationFrameAt } from "../app/selfhost/selfhost-conversation-timing";

const lengths = [17, 100, 20, 120];

describe("self-host example conversation timing", () => {
  it("types the two exchanges in order with a pause before each admin reply", () => {
    expect(conversationFrameAt(400, lengths)).toEqual({ chars: [8, 0, 0, 0], thinking: null });
    expect(conversationFrameAt(800, lengths)).toEqual({ chars: [16, 0, 0, 0], thinking: null });
    expect(conversationFrameAt(1000, lengths)).toEqual({ chars: [17, 0, 0, 0], thinking: 1 });
    expect(conversationFrameAt(1500, lengths)).toEqual({ chars: [17, 12, 0, 0], thinking: null });
    expect(conversationFrameAt(4200, lengths)).toEqual({ chars: [17, 100, 8, 0], thinking: null });
    expect(conversationFrameAt(5200, lengths)).toEqual({ chars: [17, 100, 20, 0], thinking: 3 });
    expect(conversationFrameAt(8000, lengths)).toEqual({ chars: lengths, thinking: null });
  });

  it("shows the complete transcript immediately for reduced motion", () => {
    expect(conversationFrameAt(0, lengths, true)).toEqual({ chars: lengths, thinking: null });
  });
});
