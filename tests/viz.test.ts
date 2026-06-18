import { describe, it, expect } from "vitest";
import { projectColor, nodeRadius, currencyOpacity } from "../src/viz";

describe("projectColor", () => {
  it("is deterministic per name and muted for undefined", () => {
    expect(projectColor("agentcairn")).toBe(projectColor("agentcairn"));
    expect(projectColor(undefined)).toBe("var(--text-muted)");
  });
  it("differs across distinct names", () => {
    expect(projectColor("alpha")).not.toBe(projectColor("beta"));
  });
});

describe("nodeRadius", () => {
  it("scales importance 0..1 into the radius band and clamps", () => {
    expect(nodeRadius(0)).toBe(4);
    expect(nodeRadius(1)).toBe(10);
    expect(nodeRadius(undefined)).toBe(6);
    expect(nodeRadius(5)).toBe(10);
  });
});

describe("currencyOpacity", () => {
  it("full for current, dimmed otherwise", () => {
    expect(currencyOpacity("current")).toBe(1);
    expect(currencyOpacity("superseded")).toBe(0.45);
    expect(currencyOpacity("expired")).toBe(0.45);
    expect(currencyOpacity("not_yet_valid")).toBe(0.45);
  });
});
