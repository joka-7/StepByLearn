import { describe, expect, it } from "vitest";
import { parseStoredPath } from "./storedPath";

const validStep = {
  id: "s1",
  orderIndex: 0,
  title: "Intro",
  duration: "45 minutes",
  type: "video",
  description: "Watch it",
  keyConcepts: ["a"],
  materialTitle: "Talk",
  materialUrl: "https://youtu.be/x",
  resources: [{ title: "Doc", type: "text", description: "", duration: "", url: "https://a.b" }],
  status: "done",
  doneAt: "2026-07-08T09:00:00.000Z",
  scheduledDate: "2026-07-08",
  isMilestone: true,
};

const validPath = {
  id: "p1",
  title: "Course",
  topic: "Topic",
  description: "",
  difficulty: "advanced",
  estimatedHours: 4,
  modelName: "m",
  stepDuration: "45 minutes",
  contentType: "video",
  currentKnowledge: "",
  steps: [validStep],
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-02T00:00:00.000Z",
  deletedAt: null,
};

describe("parseStoredPath", () => {
  it("round-trips a complete, valid path unchanged", () => {
    expect(parseStoredPath(validPath)).toEqual(validPath);
  });

  it.each([
    ["null", null],
    ["a string", "p1"],
    ["missing steps", { ...validPath, steps: undefined }],
    ["steps not an array", { ...validPath, steps: {} }],
    ["an empty id", { ...validPath, id: "" }],
    ["a non-string title", { ...validPath, title: 7 }],
    ["missing updatedAt", { ...validPath, updatedAt: undefined }],
  ])("rejects %s", (_name, input) => {
    expect(parseStoredPath(input)).toBeNull();
  });

  it("backfills a legacy row written before later fields existed", () => {
    const legacy = {
      id: "p1",
      title: "Old",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      steps: [{ id: "s1", title: "Old step", content: "Legacy body", status: "done" }],
    };
    const parsed = parseStoredPath(legacy);
    expect(parsed).toMatchObject({
      contentType: "all",
      stepDuration: "30 minutes",
      deletedAt: null,
      steps: [
        {
          description: "Legacy body",
          duration: "30 minutes",
          type: "text",
          keyConcepts: [],
          resources: [],
          orderIndex: 0,
          status: "done",
        },
      ],
    });
  });

  it("drops malformed steps and resources instead of failing the whole path", () => {
    const parsed = parseStoredPath({
      ...validPath,
      steps: [
        validStep,
        null,
        { id: "no-title" },
        { ...validStep, id: "s2", resources: [null, {}] },
      ],
    });
    expect(parsed?.steps.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(parsed?.steps[1]?.resources).toEqual([]);
  });

  it("strips non-http(s) URLs from the material and its resources", () => {
    const parsed = parseStoredPath({
      ...validPath,
      steps: [
        {
          ...validStep,
          materialUrl: "javascript:alert(1)",
          resources: [{ ...validStep.resources[0], url: "data:text/html,x" }],
        },
      ],
    });
    expect(parsed?.steps[0]?.materialUrl).toBe("");
    expect(parsed?.steps[0]?.resources[0]?.url).toBe("");
  });

  it("coerces unknown enum values to safe defaults", () => {
    const parsed = parseStoredPath({
      ...validPath,
      difficulty: "expert",
      contentType: "hologram",
      steps: [{ ...validStep, type: "vr", status: "archived" }],
    });
    expect(parsed).toMatchObject({
      difficulty: "beginner",
      contentType: "text",
      steps: [{ type: "text", status: "not_started" }],
    });
  });
});
