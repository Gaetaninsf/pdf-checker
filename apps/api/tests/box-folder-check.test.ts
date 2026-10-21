import { describe, it, expect } from "vitest";
import {
  filenameMatchesBothFields,
  resolveK1Templates,
  k1TemplateDisplayNames,
} from "../src/lib/box-folder-check";

describe("resolveK1Templates", () => {
  const templates = [
    {
      scope: "enterprise_1",
      templateKey: "filename",
      displayName: "K1 Partner Name and Investment Number",
      fields: [
        { key: "filename", displayName: "Partner Name" },
        { key: "investmentNumber", displayName: "Investment Number" },
      ],
    },
    {
      scope: "enterprise_1",
      templateKey: "nameMatchingForK1",
      displayName: "Name matching for K1 - Production",
      fields: [
        { key: "partnerName", displayName: "Partner Name" },
        { key: "filename", displayName: "Investor number" },
      ],
    },
  ];

  it("prefers the production template over the legacy template", () => {
    const resolved = resolveK1Templates(templates);
    expect(resolved.map((t) => t.templateKey)).toEqual(["nameMatchingForK1", "filename"]);
    expect(k1TemplateDisplayNames()[0]).toBe("Name matching for K1 - Production");
  });
});

describe("filenameMatchesBothFields", () => {
  it("matches when both partner full name and investment number appear in stem", () => {
    const result = filenameMatchesBothFields(
      "Smith John INV-1234 K1",
      "John Smith",
      "INV-1234"
    );
    expect(result.match).toBe(true);
    expect(result.matchPartner).toBe(true);
    expect(result.matchInvestment).toBe(true);
  });

  it("matches partner by last name only", () => {
    const result = filenameMatchesBothFields(
      "Smith INV-5678",
      "John Smith",
      "INV-5678"
    );
    expect(result.match).toBe(true);
    expect(result.matchPartner).toBe(true);
    expect(result.matchInvestment).toBe(true);
  });

  it("returns null when partner is empty", () => {
    const result = filenameMatchesBothFields("some-file", "", "INV-1234");
    expect(result.match).toBeNull();
    expect(result.matchPartner).toBeNull();
    expect(result.matchInvestment).toBeNull();
  });

  it("returns null when investment is empty", () => {
    const result = filenameMatchesBothFields("some-file", "John Smith", "");
    expect(result.match).toBeNull();
    expect(result.matchPartner).toBeNull();
    expect(result.matchInvestment).toBeNull();
  });

  it("returns mismatch when partner not in filename", () => {
    const result = filenameMatchesBothFields(
      "Doe INV-1234",
      "John Smith",
      "INV-1234"
    );
    expect(result.match).toBe(false);
    expect(result.matchPartner).toBe(false);
    expect(result.matchInvestment).toBe(true);
  });

  it("returns mismatch when investment not in filename", () => {
    const result = filenameMatchesBothFields(
      "Smith K1 doc",
      "John Smith",
      "INV-1234"
    );
    expect(result.match).toBe(false);
    expect(result.matchPartner).toBe(true);
    expect(result.matchInvestment).toBe(false);
  });

  it("matching is case-insensitive", () => {
    const result = filenameMatchesBothFields(
      "SMITH inv-1234",
      "John Smith",
      "INV-1234"
    );
    expect(result.match).toBe(true);
  });

  it("treats dashes, underscores, and spaces equivalently", () => {
    const result = filenameMatchesBothFields(
      "Smith_INV 1234",
      "John Smith",
      "INV-1234"
    );
    expect(result.match).toBe(true);
  });
});
