import { describe, it, expect } from "vitest";
import { normalize } from "../src/lib/normalize";

describe("normalize", () => {
  it("lowercases and trims", () => {
    expect(normalize("  Hello World  ")).toBe("hello world");
  });

  it("replaces hyphens, underscores, and multiple spaces with single space", () => {
    expect(normalize("foo-bar_baz  qux")).toBe("foo bar baz qux");
  });

  it("handles empty string", () => {
    expect(normalize("")).toBe("");
  });

  it("collapses mixed separators", () => {
    expect(normalize("A--B__C  D")).toBe("a b c d");
  });
});
