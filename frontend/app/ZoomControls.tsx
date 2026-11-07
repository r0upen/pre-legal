import { MAX_ZOOM, MIN_ZOOM } from "@/lib/zoom";

type Props = {
  zoom: number;
  fitting: boolean;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
};

const button =
  "rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-600 hover:border-teal hover:text-teal aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-slate-300 aria-disabled:hover:text-slate-600";

// Changes only the preview on screen; the PDF is laid out by the print styles. At a limit the button
// is aria-disabled, never disabled: browsers move focus off a disabled button, so someone pressing +
// from the keyboard would lose their place (same reason as the chat box, PL-11).
export default function ZoomControls({ zoom, fitting, onZoomOut, onZoomIn, onFit }: Props) {
  const atMin = zoom <= MIN_ZOOM;
  const atMax = zoom >= MAX_ZOOM;
  return (
    <div role="group" aria-label="Preview zoom" className="flex items-center gap-1.5">
      <button type="button" aria-label="Zoom out" onClick={atMin ? undefined : onZoomOut} aria-disabled={atMin} className={button}>
        −
      </button>
      <span aria-live="polite" className="w-12 text-center text-sm tabular-nums text-slate-600">
        {zoom}%
      </span>
      <button type="button" aria-label="Zoom in" onClick={atMax ? undefined : onZoomIn} aria-disabled={atMax} className={button}>
        +
      </button>
      <button
        type="button"
        onClick={onFit}
        aria-pressed={fitting}
        className={`${button} whitespace-nowrap ${fitting ? "border-teal text-teal" : ""}`}
      >
        Fit to width
      </button>
    </div>
  );
}
