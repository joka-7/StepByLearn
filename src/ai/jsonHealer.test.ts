import { describe, expect, it } from "vitest";
import { extractJsonSpan, healAndValidate, JsonHealingError } from "./jsonHealer";

const MINIMAL_VALID = JSON.stringify({
  title: "Learn Rust",
  topic: "Rust",
  description: "A path",
  difficulty: "beginner",
  estimatedHours: 10,
  steps: [
    {
      title: "Ownership",
      duration: "45 minutes",
      type: "text",
      description: "Understand ownership",
      keyConcepts: ["ownership", "borrowing"],
      materialTitle: "The Rust Book: Ownership",
      materialUrl: "https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html",
      resources: [
        {
          title: "Rust by Example",
          type: "text",
          description: "Interactive examples",
          duration: "20 minutes",
          url: "https://doc.rust-lang.org/rust-by-example/",
        },
      ],
    },
  ],
});

describe("extractJsonSpan", () => {
  it("extracts a bare JSON object unchanged", () => {
    expect(extractJsonSpan('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts the first balanced object, ignoring trailing prose", () => {
    expect(extractJsonSpan('{"a":1} trailing junk')).toBe('{"a":1}');
  });

  it("ignores braces inside string values", () => {
    const text = '{"a":"contains } a brace","b":2}';
    expect(extractJsonSpan(text)).toBe(text);
  });

  it("throws when there's no opening brace at all", () => {
    expect(() => extractJsonSpan("no json here")).toThrow(JsonHealingError);
  });

  it("throws when the object is never closed", () => {
    expect(() => extractJsonSpan('{"a":1')).toThrow(JsonHealingError);
  });
});

describe("healAndValidate", () => {
  it("parses a clean, well-formed syllabus", () => {
    const draft = healAndValidate(MINIMAL_VALID);
    expect(draft.title).toBe("Learn Rust");
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0]).toMatchObject({
      title: "Ownership",
      type: "text",
      materialUrl: "https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html",
    });
    expect(draft.steps[0].resources).toHaveLength(1);
  });

  it("strips markdown code fences around the JSON", () => {
    const fenced = "```json\n" + MINIMAL_VALID + "\n```";
    const draft = healAndValidate(fenced);
    expect(draft.title).toBe("Learn Rust");
  });

  it("extracts the JSON object even when wrapped in leading prose", () => {
    const withProse = "Here you go:\n\n" + MINIMAL_VALID + "\n\nHope that helps!";
    const draft = healAndValidate(withProse);
    expect(draft.title).toBe("Learn Rust");
  });

  it("falls back to 'text' for an invalid or missing step type", () => {
    const raw = JSON.stringify({
      steps: [{ title: "Step", type: "interpretive-dance" }],
    });
    const draft = healAndValidate(raw);
    expect(draft.steps[0].type).toBe("text");
  });

  it("drops materialUrl and resource urls that aren't http(s)", () => {
    const raw = JSON.stringify({
      steps: [
        {
          title: "Step",
          materialUrl: "javascript:alert(1)",
          resources: [{ title: "Bad", url: "not-a-url" }],
        },
      ],
    });
    const draft = healAndValidate(raw);
    expect(draft.steps[0].materialUrl).toBe("");
    expect(draft.steps[0].resources[0].url).toBe("");
  });

  it("drops resources with no title", () => {
    const raw = JSON.stringify({
      steps: [
        {
          title: "Step",
          resources: [{ url: "https://example.com", description: "no title" }],
        },
      ],
    });
    const draft = healAndValidate(raw);
    expect(draft.steps[0].resources).toHaveLength(0);
  });

  it("drops steps with no title, keeping the rest", () => {
    const raw = JSON.stringify({
      steps: [{ title: "" }, { title: "Keep me" }],
    });
    const draft = healAndValidate(raw);
    expect(draft.steps).toHaveLength(1);
    expect(draft.steps[0].title).toBe("Keep me");
  });

  it("falls back to 'beginner' for an invalid difficulty", () => {
    const raw = JSON.stringify({
      difficulty: "expert-plus-ultra",
      steps: [{ title: "Step" }],
    });
    expect(healAndValidate(raw).difficulty).toBe("beginner");
  });

  it("throws when every step is unusable", () => {
    const raw = JSON.stringify({ steps: [{ title: "" }, {}] });
    expect(() => healAndValidate(raw)).toThrow(JsonHealingError);
  });

  it("throws on output with no JSON object at all", () => {
    expect(() => healAndValidate("Sorry, I can't help with that.")).toThrow(JsonHealingError);
  });

  it("throws on malformed JSON syntax", () => {
    expect(() => healAndValidate("{title: 'unquoted keys'}")).toThrow(JsonHealingError);
  });
});
