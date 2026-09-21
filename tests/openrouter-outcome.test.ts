import { describe, expect, it } from "vitest";
import { normalizeOpenRouterCallbackOutcome } from "@/components/settings/openRouterOutcome";

describe("OpenRouter settings callback outcome", () => {
  it("accepts only recognized scalar callback values", () => {
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: "connected" })).toEqual({ status: "connected" });
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: "cancelled" })).toEqual({ status: "cancelled" });
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: "error", reason: "configuration" })).toEqual({ status: "error", reason: "configuration" });
  });

  it("bounds unknown, repeated, and array-valued query parameters", () => {
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: "error", reason: "untrusted text" })).toEqual({ status: "error", reason: "connection" });
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: "error", reason: ["configuration"] })).toEqual({ status: "error", reason: "connection" });
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: ["connected"] })).toBeNull();
    expect(normalizeOpenRouterCallbackOutcome({ openrouter: "unexpected", reason: "configuration" })).toBeNull();
  });
});