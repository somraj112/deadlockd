import React, { useEffect, useRef } from 'react';
import { DeadlockdPlan } from '../utils/planLogic';
import {
  renderOsPreviewOverlay,
  renderWallpaperToCanvas,
  WallpaperLayoutMetrics,
} from '../utils/wallpaperRenderer';
import { Check, Clock, Maximize2 } from 'lucide-react';

interface WallpaperStageProps {
  plan: DeadlockdPlan;
  todayStr: string;
  width: number;
  height: number;
  showClockGuides: boolean;
  onToggleClockGuides: () => void;
  onOpenFullSize: () => void;
  nextSummaryText: string;
  onMetricsComputed?: (metrics: WallpaperLayoutMetrics) => void;
}

export const WallpaperStage: React.FC<WallpaperStageProps> = ({
  plan,
  todayStr,
  width,
  height,
  showClockGuides,
  onToggleClockGuides,
  onOpenFullSize,
  nextSummaryText,
  onMetricsComputed,
}) => {
  const artworkCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const draw = () => {
      if (cancelled) return;
      if (artworkCanvasRef.current) {
        const metrics = renderWallpaperToCanvas(
          artworkCanvasRef.current,
          plan,
          todayStr,
          width,
          height
        );
        onMetricsComputed?.(metrics);
      }
      if (overlayCanvasRef.current) {
        const effectiveOs = showClockGuides ? plan.osPreview : 'none';
        renderOsPreviewOverlay(
          overlayCanvasRef.current,
          effectiveOs,
          width,
          height,
          todayStr
        );
      }
    };

    draw();

    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready
        .then(() => {
          if (!cancelled) draw();
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [plan, todayStr, width, height, showClockGuides, onMetricsComputed]);

  const isLandscape = width / height >= 1.15;

  return (
    <div className="relative flex flex-col xl:flex-row items-center justify-center gap-4 xl:gap-6 w-full h-full select-none">
      {/* Stage Viewport Container — enlarged to minimize empty space around the artwork */}
      <div
        className={`relative flex items-center justify-center w-full ${
          isLandscape
            ? 'max-w-[960px] max-h-[64vh] lg:max-h-[78vh]'
            : 'max-w-[420px] sm:max-w-[460px] lg:max-w-[490px] max-h-[74vh] lg:max-h-[84vh]'
        }`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <div
          onClick={onOpenFullSize}
          title="Click to inspect full-size PNG"
          className="group relative w-full h-full overflow-hidden rounded-2xl border border-[#F4F0EA]/20 bg-[#0B0F17] shadow-2xl cursor-zoom-in transition-colors hover:border-[#F4F0EA]/35"
          style={{ aspectRatio: `${width} / ${height}` }}
        >
          {/* Actual Artwork Canvas (Identical to Exported PNG) */}
          <canvas
            ref={artworkCanvasRef}
            width={width}
            height={height}
            data-testid="wallpaper-canvas"
            aria-label={`Deadlockd wallpaper preview for ${plan.goal}, due ${plan.deadline}`}
            className="block w-full h-full object-contain"
          />

          {/* Separate Fit Preview Overlay Canvas (Never included in PNG export) */}
          <canvas
            ref={overlayCanvasRef}
            width={width}
            height={height}
            data-testid="os-overlay-canvas"
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 block w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Controls Beside the Preview: View full size & Show clock guides */}
      <div
        aria-label="Preview inspection controls"
        className="flex flex-row xl:flex-col items-center xl:items-stretch justify-center gap-2.5 shrink-0 w-full xl:w-[196px] max-w-[490px]"
      >
        <button
          type="button"
          data-testid="view-full-size-btn"
          onClick={onOpenFullSize}
          className="flex-1 xl:flex-none min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/20 hover:border-[#F4F0EA]/45 text-xs font-semibold text-[#F4F0EA] inline-flex items-center justify-center xl:justify-start gap-2 transition-colors whitespace-nowrap cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0" />
          <span>View full size</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={showClockGuides}
          data-testid="toggle-clock-guides"
          onClick={onToggleClockGuides}
          className={`flex-1 xl:flex-none min-h-[42px] px-3.5 py-2 rounded-xl border text-xs font-medium inline-flex items-center justify-center xl:justify-between gap-2 transition-colors whitespace-nowrap cursor-pointer ${
            showClockGuides
              ? 'bg-[#F4F0EA]/12 border-[#F4F0EA]/35 text-[#F4F0EA]'
              : 'bg-[#0E131D] border-[#F4F0EA]/15 text-[#C6C0B4] hover:border-[#F4F0EA]/30 hover:text-[#F4F0EA]'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-[#8A8479] shrink-0" />
            <span>Show clock guides</span>
          </span>
          <span
            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
              showClockGuides
                ? 'bg-[#FF5A1F] border-[#FF5A1F] text-[#080B10]'
                : 'bg-[#080B10] border-[#F4F0EA]/25 text-transparent'
            }`}
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </span>
        </button>

        {/* Quiet artwork metadata summary beside the preview */}
        <div className="hidden xl:flex flex-col gap-1 pt-2 px-1 text-[11px] text-[#8A8479] border-t border-[#F4F0EA]/10">
          <span className="font-mono tabular-nums text-[#C6C0B4] font-medium">
            {width} × {height} PNG
          </span>
          <span className="leading-snug">{nextSummaryText}</span>
          {plan.isBuiltInExample && (
            <span className="text-[#8A8479]/80">Built-in example</span>
          )}
        </div>
      </div>
    </div>
  );
};
