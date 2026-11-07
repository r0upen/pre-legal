// The preview's zoom, in percent. The page is at most PAGE_WIDTH wide at 100%, so its lines stay
// comfortable to read however wide the panel is (matches .preview-page in globals.css).
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 200;
const STEP = 10;
const PAGE_WIDTH = 768;

// The zoom at which the page fills a panel. Never below 100%: a page fills any narrower panel anyway.
export function fitZoom(panelWidth: number): number {
  return Math.min(MAX_ZOOM, Math.max(100, Math.floor((panelWidth / PAGE_WIDTH) * 100)));
}

// The next round step up or down, so 124% goes to 130% or 120%.
export function zoomIn(zoom: number): number {
  return Math.min(MAX_ZOOM, (Math.floor(zoom / STEP) + 1) * STEP);
}

export function zoomOut(zoom: number): number {
  return Math.max(MIN_ZOOM, (Math.ceil(zoom / STEP) - 1) * STEP);
}
