import React, { useState, useEffect } from 'react';
import {
  DeadlockdPlan,
  DEVICE_PRESETS,
  DevicePresetId,
  MAX_DIMENSION_PX,
  MIN_DIMENSION_PX,
  OsPreviewId,
  validateCustomDimensions,
} from '../utils/planLogic';
import { ChevronDown, ChevronUp, RotateCcw, SlidersHorizontal } from 'lucide-react';

interface TargetScreenControlsProps {
  plan: DeadlockdPlan;
  onSelectPreset: (preset: DevicePresetId) => void;
  onUpdateCustomSize: (width: number, height: number) => void;
  onSelectOsPreview: (os: OsPreviewId) => void;
  onUpdateOffsets: (offsetX: number, offsetY: number) => void;
  onEnsureClockGuidesVisible?: () => void;
}

const PRESET_OPTIONS: { id: DevicePresetId; label: string; dim: string }[] = [
  { id: 'phone', label: 'Phone', dim: '1080×1920' },
  { id: 'tall-phone', label: 'Tall phone', dim: '1080×2400' },
  { id: 'laptop', label: 'Laptop', dim: '2560×1600' },
  { id: 'desktop', label: 'Desktop', dim: '3840×2160' },
  { id: 'custom', label: 'Custom', dim: 'W×H' },
];

const OS_OPTIONS: { id: OsPreviewId; label: string }[] = [
  { id: 'iphone', label: 'iPhone' },
  { id: 'android', label: 'Android' },
  { id: 'macos', label: 'macOS' },
  { id: 'windows', label: 'Windows' },
  { id: 'none', label: 'None' },
];

export const TargetScreenControls: React.FC<TargetScreenControlsProps> = ({
  plan,
  onSelectPreset,
  onUpdateCustomSize,
  onSelectOsPreview,
  onUpdateOffsets,
  onEnsureClockGuidesVisible,
}) => {
  const [draftWidth, setDraftWidth] = useState(String(plan.customWidth));
  const [draftHeight, setDraftHeight] = useState(String(plan.customHeight));
  const [customError, setCustomError] = useState<string | null>(null);
  const [isAdjustFitOpen, setIsAdjustFitOpen] = useState<boolean>(false);

  useEffect(() => {
    setDraftWidth(String(plan.customWidth));
    setDraftHeight(String(plan.customHeight));
  }, [plan.customWidth, plan.customHeight]);

  const handleApplyCustom = (wStr: string, hStr: string) => {
    setDraftWidth(wStr);
    setDraftHeight(hStr);
    const numW = Number(wStr);
    const numH = Number(hStr);
    const result = validateCustomDimensions(numW, numH);
    if (!result.valid) {
      setCustomError(result.error || 'Invalid custom dimensions.');
    } else {
      setCustomError(null);
      onUpdateCustomSize(result.width, result.height);
    }
  };

  const activeOsLabel =
    OS_OPTIONS.find((o) => o.id === plan.osPreview)?.label || 'iPhone';
  const hasOffset = plan.routeOffsetX !== 0 || plan.routeOffsetY !== 0;

  return (
    <section
      aria-label="Target screen and fit controls"
      className="border-t border-[#F4F0EA]/10 pt-5 space-y-3.5"
    >
      {/* Output Resolution Presets (Readily Available) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[#C6C0B4]">
            Output size
          </span>
          <span className="text-xs font-mono tabular-nums text-[#8A8479]">
            {plan.preset === 'custom'
              ? `${plan.customWidth} × ${plan.customHeight}`
              : `${DEVICE_PRESETS[plan.preset].width} × ${DEVICE_PRESETS[plan.preset].height}`}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {PRESET_OPTIONS.map((opt) => {
            const active = plan.preset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`preset-${opt.id}`}
                onClick={() => onSelectPreset(opt.id)}
                className={`min-h-[42px] px-2.5 py-1.5 rounded-lg text-left transition-colors border cursor-pointer ${
                  active
                    ? 'bg-[#F4F0EA]/12 border-[#FF5A1F] text-[#F4F0EA]'
                    : 'bg-[#0E131D] border-[#F4F0EA]/10 text-[#C6C0B4] hover:border-[#F4F0EA]/25 hover:text-[#F4F0EA]'
                }`}
              >
                <div className="text-xs font-semibold leading-tight whitespace-nowrap truncate">
                  {opt.label}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-[#8A8479] leading-tight mt-0.5">
                  {opt.dim}
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom Width & Height Inputs */}
        {plan.preset === 'custom' && (
          <div className="mt-3 p-3 rounded-lg bg-[#0E131D] border border-[#F4F0EA]/10 space-y-2">
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="custom-width-input"
                  className="block text-[11px] text-[#8A8479] mb-1"
                >
                  Width (px)
                </label>
                <input
                  id="custom-width-input"
                  type="number"
                  min={MIN_DIMENSION_PX}
                  max={MAX_DIMENSION_PX}
                  value={draftWidth}
                  onChange={(e) =>
                    handleApplyCustom(e.target.value, draftHeight)
                  }
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded bg-[#080B10] border border-[#F4F0EA]/15 text-xs font-mono tabular-nums text-[#F4F0EA] focus:outline-none focus:border-[#FF5A1F]"
                />
              </div>
              <div>
                <label
                  htmlFor="custom-height-input"
                  className="block text-[11px] text-[#8A8479] mb-1"
                >
                  Height (px)
                </label>
                <input
                  id="custom-height-input"
                  type="number"
                  min={MIN_DIMENSION_PX}
                  max={MAX_DIMENSION_PX}
                  value={draftHeight}
                  onChange={(e) =>
                    handleApplyCustom(draftWidth, e.target.value)
                  }
                  className="w-full min-h-[40px] px-2.5 py-1.5 rounded bg-[#080B10] border border-[#F4F0EA]/15 text-xs font-mono tabular-nums text-[#F4F0EA] focus:outline-none focus:border-[#FF5A1F]"
                />
              </div>
            </div>
            <p className="text-[11px] text-[#8A8479]">
              Limits: {MIN_DIMENSION_PX}–{MAX_DIMENSION_PX} px per side · Max
              16.8 MP browser memory budget.
            </p>
            {customError && (
              <p role="alert" className="text-xs text-[#FF5A1F] font-medium">
                {customError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Adjust Fit Disclosure (Tucks OS Selector & Route Position Sliders) */}
      <div className="pt-1">
        <button
          type="button"
          data-testid="adjust-fit-toggle"
          aria-expanded={isAdjustFitOpen}
          onClick={() => {
            const nextOpen = !isAdjustFitOpen;
            setIsAdjustFitOpen(nextOpen);
            if (nextOpen) {
              onEnsureClockGuidesVisible?.();
            }
          }}
          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/12 hover:border-[#F4F0EA]/25 flex items-center justify-between text-xs transition-colors cursor-pointer"
        >
          <span className="inline-flex items-center gap-2 font-medium text-[#C6C0B4]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#8A8479]" />
            <span>Adjust fit</span>
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-mono text-[#8A8479]">
            <span>
              {activeOsLabel}
              {hasOffset
                ? ` · ${plan.routeOffsetY >= 0 ? `+${plan.routeOffsetY}` : plan.routeOffsetY}% Y`
                : ''}
            </span>
            {isAdjustFitOpen ? (
              <ChevronUp className="w-3.5 h-3.5 text-[#C6C0B4]" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-[#8A8479]" />
            )}
          </span>
        </button>

        {isAdjustFitOpen && (
          <div className="mt-2.5 p-3.5 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/12 space-y-4">
            {/* Separate OS Fit Preview Control */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#C6C0B4]">
                  OS clock guide
                </span>
                <span className="text-[11px] text-[#8A8479]">
                  Preview only · Excluded from PNG
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {OS_OPTIONS.map((os) => {
                  const active = plan.osPreview === os.id;
                  return (
                    <button
                      key={os.id}
                      type="button"
                      onClick={() => {
                        onSelectOsPreview(os.id);
                        if (os.id !== 'none') {
                          onEnsureClockGuidesVisible?.();
                        }
                      }}
                      className={`min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border cursor-pointer ${
                        active
                          ? 'bg-[#F4F0EA]/12 border-[#F4F0EA]/40 text-[#F4F0EA]'
                          : 'bg-[#080B10] border-[#F4F0EA]/10 text-[#8A8479] hover:text-[#F4F0EA]'
                      }`}
                    >
                      {os.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Route Position Offset Adjustment */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-[#C6C0B4]">
                  Route position offset
                </span>
                {hasOffset && (
                  <button
                    type="button"
                    onClick={() => onUpdateOffsets(0, 0)}
                    className="inline-flex items-center gap-1 text-xs text-[#C6C0B4] hover:text-[#F4F0EA] cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset offset
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#080B10] p-2.5 rounded-lg border border-[#F4F0EA]/10">
                <div>
                  <div className="flex justify-between text-[11px] text-[#8A8479] mb-1">
                    <label htmlFor="route-offset-y">Vertical shift</label>
                    <span className="font-mono tabular-nums">
                      {plan.routeOffsetY > 0
                        ? `+${plan.routeOffsetY}%`
                        : `${plan.routeOffsetY}%`}
                    </span>
                  </div>
                  <input
                    id="route-offset-y"
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={plan.routeOffsetY}
                    onChange={(e) => {
                      onEnsureClockGuidesVisible?.();
                      onUpdateOffsets(
                        plan.routeOffsetX,
                        Number(e.target.value)
                      );
                    }}
                    className="w-full accent-[#FF5A1F] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-[#8A8479] mb-1">
                    <label htmlFor="route-offset-x">Horizontal shift</label>
                    <span className="font-mono tabular-nums">
                      {plan.routeOffsetX > 0
                        ? `+${plan.routeOffsetX}%`
                        : `${plan.routeOffsetX}%`}
                    </span>
                  </div>
                  <input
                    id="route-offset-x"
                    type="range"
                    min={-100}
                    max={100}
                    step={5}
                    value={plan.routeOffsetX}
                    onChange={(e) => {
                      onEnsureClockGuidesVisible?.();
                      onUpdateOffsets(
                        Number(e.target.value),
                        plan.routeOffsetY
                      );
                    }}
                    className="w-full accent-[#FF5A1F] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
