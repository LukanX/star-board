import { describe, expect, it, vi } from "vitest";
import { EnemyJobCancelledError, waitForEnemyBackgroundJob, type EnemyBackgroundJob } from "@/lib/ai/enemy-job-polling";

const job: EnemyBackgroundJob = {
  generationRunId: "00000000-0000-4000-8000-000000000003",
  status: "pending",
  mode: "create",
  model: "openai/gpt-4o-mini",
  createdAt: "2026-08-27T12:00:00.000Z",
  statusUpdatedAt: "2026-08-27T12:00:00.000Z",
};

const waitImmediately = vi.fn().mockResolvedValue(undefined);
const freshNow = () => Date.parse(job.statusUpdatedAt!) + 1000;

const draft = {
  name: "Void Stalker",
  playerDescription: "A patient predator that hunts along the hull.",
  level: 5,
  size: "medium" as const,
  rarity: "common" as const,
  traits: ["aberration"],
  family: null,
  statBlock: {
    schemaVersion: 1 as const,
    recallKnowledge: null,
    perception: { modifier: 12, senses: [], notes: "" },
    languages: { names: [], additionalCount: 0, communicationNotes: "" },
    skills: [],
    abilityModifiers: { strength: 4, dexterity: 3, constitution: 3, intelligence: 0, wisdom: 2, charisma: 0 },
    items: [],
    defenses: {
      armorClass: 22,
      armorClassNotes: "",
      saves: { fortitude: { modifier: 11, notes: "" }, reflex: { modifier: 12, notes: "" }, will: { modifier: 9, notes: "" } },
      hitPoints: [{ label: "HP", value: 80, notes: "" }],
      immunities: [],
      resistances: [],
      weaknesses: [],
      notes: "",
    },
    movement: [],
    strikes: [],
    spellcasting: [],
    specialAbilities: [],
    unparsedFragments: [],
  },
  gmNotesMarkdown: "It avoids bright light.",
  artSubject: "A void stalker on a starship hull.",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("enemy background polling", () => {
  it("resolves a validated complete draft", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ job: { status: "complete", draft } }));

    await expect(waitForEnemyBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: freshNow })).resolves.toEqual(draft);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining(job.generationRunId), expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
  });

  it("stops on an explicit failed job", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ job: { status: "failed" }, error: "Provider unavailable" }));

    await expect(waitForEnemyBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: freshNow })).rejects.toThrow("Provider unavailable");
  });

  it("allows transient failures before stopping", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(response({ job: { status: "pending", statusUpdatedAt: job.statusUpdatedAt } }, 503))
      .mockResolvedValueOnce(response({ job: { status: "pending", statusUpdatedAt: job.statusUpdatedAt } }, 503));

    await expect(waitForEnemyBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: freshNow })).rejects.toThrow("status could not be reached");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects a stale pending job before polling", async () => {
    const fetchImpl = vi.fn();
    const now = Date.parse(job.statusUpdatedAt!) + 4 * 60 * 1000;

    await expect(waitForEnemyBackgroundJob(job, { fetchImpl, wait: waitImmediately, now: () => now })).rejects.toThrow("background worker did not start");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("cancels while waiting", async () => {
    const controller = new AbortController();
    const wait = vi.fn((_milliseconds: number, signal?: AbortSignal) => {
      controller.abort();
      return signal?.aborted ? Promise.reject(new EnemyJobCancelledError()) : Promise.resolve();
    });

    await expect(waitForEnemyBackgroundJob(job, { signal: controller.signal, wait, now: freshNow })).rejects.toBeInstanceOf(EnemyJobCancelledError);
  });
});