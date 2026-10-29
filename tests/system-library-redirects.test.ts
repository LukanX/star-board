import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));

import SystemPage from "@/app/system/page";
import SystemList from "@/app/system/[category]/page";
import SystemDetail from "@/app/system/[category]/[referenceId]/page";
import LibraryAccessPage from "@/app/system/access/page";

const campaign = "00000000-0000-4000-8000-000000000001";
const root = `/campaigns/${campaign}/library`;

describe("legacy System library redirects", () => {
  it("moves campaign root and category links to their canonical campaign routes", async () => {
    await expect(SystemPage({ searchParams: Promise.resolve({ campaign }) })).rejects.toThrow(`REDIRECT:${root}/ancestries`);
    await expect(SystemList({
      params: Promise.resolve({ category: "creature-traits" }), searchParams: Promise.resolve({ campaign, q: "Undead" }),
    })).rejects.toThrow(`REDIRECT:${root}/creature-traits?q=Undead`);
  });

  it("retains a detail identity and the access directory's search/pagination", async () => {
    await expect(SystemDetail({
      params: Promise.resolve({ category: "ancestries", referenceId: "reference/one" }),
      searchParams: Promise.resolve({ campaign }),
    })).rejects.toThrow(`REDIRECT:${root}/ancestries/reference%2Fone`);
    await expect(LibraryAccessPage({
      searchParams: Promise.resolve({ campaign, q: "member", limit: "1", cursor: "{}" }),
    })).rejects.toThrow(`REDIRECT:${root}/access?q=member&limit=1&cursor=%7B%7D`);
  });

  it("sends standalone browsing to campaign selection, not a second library", async () => {
    await expect(SystemPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/campaigns");
    await expect(SystemDetail({
      params: Promise.resolve({ category: "ancestries", referenceId: "reference" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("REDIRECT:/campaigns");
  });

  it("rejects invalid campaign and category inputs", async () => {
    await expect(SystemPage({ searchParams: Promise.resolve({ campaign: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    await expect(SystemList({
      params: Promise.resolve({ category: "invalid" }), searchParams: Promise.resolve({ campaign }),
    })).rejects.toThrow("NOT_FOUND");
  });
});
