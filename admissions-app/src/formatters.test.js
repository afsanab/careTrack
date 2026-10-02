import { describe, it, expect } from "vitest";
import { titleCaseText, formatPhysicianDisplay, uniqueCi, sameCi } from "./formatters.js";

describe("titleCaseText", () => {
  it("normalises mixed case names", () => {
    expect(titleCaseText("ADA")).toBe("Ada");
    expect(titleCaseText("o'brien")).toBe("O'Brien");
    expect(titleCaseText("sunrise CARE center")).toBe("Sunrise Care Center");
    expect(titleCaseText("214-a")).toBe("214-A");
    expect(titleCaseText("dr smith")).toBe("Dr. Smith");
  });
});

describe("formatPhysicianDisplay", () => {
  it("formats login ids and display names", () => {
    expect(formatPhysicianDisplay("dr.smith")).toBe("Dr. Smith");
    expect(formatPhysicianDisplay("DR SMITH")).toBe("Dr. Smith");
  });
});

describe("uniqueCi / sameCi", () => {
  it("dedupes and compares ignoring case", () => {
    expect(uniqueCi(["Sunrise", "sunrise", "Maplewood"])).toEqual(["Maplewood", "Sunrise"]);
    expect(sameCi("Sunrise", "sunrise")).toBe(true);
    expect(sameCi("Sunrise", "Maplewood")).toBe(false);
  });
});
