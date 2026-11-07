import { describe, expect, it } from "vitest";
import { fitZoom, MAX_ZOOM, MIN_ZOOM, zoomIn, zoomOut } from "./zoom";

describe("fitZoom", () => {
  it("makes the page fill the panel", () => {
    expect(fitZoom(768)).toBe(100);
    expect(fitZoom(1152)).toBe(150);
  });

  it("rounds down, so the page never needs more room than the panel has", () => {
    expect(fitZoom(953)).toBe(124);
  });

  it("stays at 100% on a panel narrower than a page, and stops at the limit", () => {
    expect(fitZoom(400)).toBe(100);
    expect(fitZoom(0)).toBe(100);
    expect(fitZoom(3000)).toBe(MAX_ZOOM);
  });
});

describe("zoomIn and zoomOut", () => {
  it("move in steps of 10", () => {
    expect(zoomIn(100)).toBe(110);
    expect(zoomOut(100)).toBe(90);
  });

  it("go to the next round step from a fitted zoom", () => {
    expect(zoomIn(124)).toBe(130);
    expect(zoomOut(124)).toBe(120);
  });

  it("stop at the limits", () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomIn(195)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
    expect(zoomOut(55)).toBe(MIN_ZOOM);
  });
});
