import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  buildExportFilename,
  createDefaultExamplePlan,
  DeadlockdPlan,
  deriveRouteState,
  DEVICE_PRESETS,
  DevicePresetId,
  loadOrCreatePlan,
  OsPreviewId,
  resolveOutputDimensions,
  savePlanToStorage,
  validateSuggestedMilestones,
} from './utils/planLogic';
import {
  buildCountdownSummary,
  formatFullDate,
  formatShortDate,
  getTodayInTimeZone,
} from './utils/dateUtils';
import {
  exportWallpaperPng,
  renderOsPreviewOverlay,
  renderWallpaperToCanvas,
} from './utils/wallpaperRenderer';
import { WallpaperStage } from './components/WallpaperStage';
import {
  PendingGeminiDraft,
  PlanEditorPanel,
} from './components/PlanEditorPanel';
import { TargetScreenControls } from './components/TargetScreenControls';
import { TerminalDrawer } from './components/TerminalDrawer';
import {
  Download,
  Edit3,
  Terminal as TerminalIcon,
  CheckCircle2,
  X,
  Clock,
  Check,
} from 'lucide-react';

interface ExportReceipt {
  filename: string;
  width: number;
  height: number;
  platformInstructions: string;
}

function getPlatformInstructions(
  preset: DevicePresetId,
  osPreview: OsPreviewId
): string {
  if (
    osPreview === 'iphone' ||
    (osPreview === 'none' && preset === 'phone')
  ) {
    return 'iPhone: Open Photos → Share → Use as Wallpaper, then pinch or drag if needed and tap Add.';
  }
  if (
    osPreview === 'android' ||
    (osPreview === 'none' && preset === 'tall-phone')
  ) {
    return 'Android: Open Photos/Gallery → More (⋮) → Set as wallpaper → Lock screen.';
  }
  if (
    osPreview === 'macos' ||
    (osPreview === 'none' && preset === 'laptop')
  ) {
    return 'macOS: Control-click the downloaded PNG in Finder → Set Desktop Picture (or System Settings → Wallpaper).';
  }
  return 'Windows / Desktop: Right-click the downloaded PNG → Set as desktop background (or Settings → Personalization → Lock screen).';
}

export default function App() {
  const [plan, setPlan] = useState<DeadlockdPlan>(() => loadOrCreatePlan());
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [isTerminalOpen, setIsTerminalOpen] = useState<boolean>(false);
  const [isSuggesting, setIsSuggesting] = useState<boolean>(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<PendingGeminiDraft | null>(
    null
  );
  const [exportReceipt, setExportReceipt] = useState<ExportReceipt | null>(
    null
  );
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Clock guides default to off so the exported artwork is unencumbered on first view
  const [showClockGuides, setShowClockGuides] = useState<boolean>(false);
  const [isFullSizeOpen, setIsFullSizeOpen] = useState<boolean>(false);
  const [fullSizeZoom, setFullSizeZoom] = useState<'fit' | 'actual'>('fit');

  const fullSizeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fullSizeOverlayRef = useRef<HTMLCanvasElement | null>(null);

  // Save plan on every state change
  useEffect(() => {
    savePlanToStorage(plan);
  }, [plan]);

  const todayStr = getTodayInTimeZone(plan.timeZone);
  const routeState = deriveRouteState(plan);
  const countdown = buildCountdownSummary(
    todayStr,
    plan.deadline,
    routeState.allComplete
  );
  const { width, height } = resolveOutputDimensions(plan);

  // Render full-size inspector canvas when modal is open
  useEffect(() => {
    if (!isFullSizeOpen) return;
    if (fullSizeCanvasRef.current) {
      renderWallpaperToCanvas(
        fullSizeCanvasRef.current,
        plan,
        todayStr,
        width,
        height
      );
    }
    if (fullSizeOverlayRef.current) {
      const effectiveOs = showClockGuides ? plan.osPreview : 'none';
      renderOsPreviewOverlay(
        fullSizeOverlayRef.current,
        effectiveOs,
        width,
        height,
        todayStr
      );
    }
  }, [isFullSizeOpen, plan, todayStr, width, height, showClockGuides]);

  // Close full-size modal on Escape key
  useEffect(() => {
    if (!isFullSizeOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullSizeOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullSizeOpen]);

  const handleDownloadWallpaper = useCallback(async (): Promise<string> => {
    setIsExporting(true);
    try {
      const filename = buildExportFilename(
        plan.goal,
        plan.preset,
        width,
        height
      );
      const result = await exportWallpaperPng(
        plan,
        todayStr,
        width,
        height,
        filename
      );
      const instructions = getPlatformInstructions(plan.preset, plan.osPreview);
      setExportReceipt({
        filename: result.filename,
        width: result.width,
        height: result.height,
        platformInstructions: instructions,
      });
      return `Exported ${result.filename} (${result.width} × ${result.height} px).`;
    } finally {
      setIsExporting(false);
    }
  }, [plan, todayStr, width, height]);

  const handleUpdateGoalAndDeadline = (newGoal: string, newDeadline: string) => {
    setPlan((prev) => ({
      ...prev,
      goal: newGoal,
      deadline: newDeadline,
      isBuiltInExample: false,
    }));
  };

  const handleToggleMilestoneDone = (id: string) => {
    setPlan((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) =>
        m.id === id ? { ...m, done: !m.done } : m
      ),
    }));
  };

  const handleUpdateMilestone = (id: string, label: string, date: string) => {
    setPlan((prev) => ({
      ...prev,
      isBuiltInExample: false,
      milestones: prev.milestones.map((m) =>
        m.id === id ? { ...m, label, date } : m
      ),
    }));
  };

  const handleDeleteMilestone = (id: string) => {
    setPlan((prev) => ({
      ...prev,
      isBuiltInExample: false,
      milestones: prev.milestones.filter((m) => m.id !== id),
    }));
  };

  const handleAddMilestone = (label: string, date: string) => {
    const newId = `ms-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setPlan((prev) => ({
      ...prev,
      isBuiltInExample: false,
      milestones: [...prev.milestones, { id: newId, label, date, done: false }],
    }));
  };

  const handleSelectPreset = (preset: DevicePresetId) => {
    setPlan((prev) => {
      const nextOs =
        preset !== 'custom' && prev.osPreview !== 'none'
          ? DEVICE_PRESETS[preset].defaultOs
          : prev.osPreview;
      return {
        ...prev,
        preset,
        osPreview: nextOs,
      };
    });
  };

  const handleUpdateCustomSize = (customWidth: number, customHeight: number) => {
    setPlan((prev) => ({
      ...prev,
      preset: 'custom',
      customWidth,
      customHeight,
    }));
  };

  const handleSelectOsPreview = (osPreview: OsPreviewId) => {
    setPlan((prev) => ({ ...prev, osPreview }));
  };

  const handleUpdateOffsets = (routeOffsetX: number, routeOffsetY: number) => {
    setPlan((prev) => ({ ...prev, routeOffsetX, routeOffsetY }));
  };

  const handleToggleClockGuides = () => {
    setShowClockGuides((prev) => {
      const next = !prev;
      if (next && plan.osPreview === 'none') {
        const defaultOs =
          plan.preset !== 'custom'
            ? DEVICE_PRESETS[plan.preset].defaultOs
            : 'iphone';
        setPlan((p) => ({ ...p, osPreview: defaultOs }));
      }
      return next;
    });
  };

  const handleResetToExample = () => {
    const freshExample = createDefaultExamplePlan();
    setPlan(freshExample);
    setPendingDraft(null);
    setGeminiError(null);
  };

  const handleRequestGeminiSuggestions = async (
    goalToSuggest: string,
    deadlineToSuggest: string
  ): Promise<string> => {
    setIsSuggesting(true);
    setGeminiError(null);

    try {
      const response = await fetch('/api/suggest-milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: goalToSuggest,
          deadline: deadlineToSuggest,
          today: todayStr,
        }),
      });

      const data = (await response.json()) as {
        milestones?: unknown;
        error?: string;
      };

      if (!response.ok || data.error) {
        const errMsg =
          data.error ||
          'Gemini is currently unavailable. Your existing plan is preserved—you can edit milestones manually.';
        setGeminiError(errMsg);
        return `Gemini notice: ${errMsg}`;
      }

      const check = validateSuggestedMilestones(
        data.milestones,
        todayStr,
        deadlineToSuggest
      );
      if (!check.valid) {
        const errMsg =
          check.error ||
          'Suggested milestones did not pass date validation. Your current plan is untouched.';
        setGeminiError(errMsg);
        return `Validation error: ${errMsg}`;
      }

      setPendingDraft({
        goal: goalToSuggest,
        deadline: deadlineToSuggest,
        milestones: check.milestones,
      });
      setIsEditorOpen(true);

      return `Draft ready (${check.milestones.length} milestones for "${goalToSuggest}"). Review and accept in the studio editor.`;
    } catch {
      const errMsg =
        'Could not connect to the Gemini suggestion service. Your current plan is preserved—you can add milestones manually.';
      setGeminiError(errMsg);
      return `Error: ${errMsg}`;
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleUpdateDraftItem = (
    index: number,
    label: string,
    date: string
  ) => {
    setPendingDraft((prev) => {
      if (!prev) return null;
      const updated = prev.milestones.map((item, i) =>
        i === index ? { label, date } : item
      );
      return { ...prev, milestones: updated };
    });
  };

  const handleRemoveDraftItem = (index: number) => {
    setPendingDraft((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        milestones: prev.milestones.filter((_, i) => i !== index),
      };
    });
  };

  const handleAcceptDraft = () => {
    if (!pendingDraft) return;
    const check = validateSuggestedMilestones(
      pendingDraft.milestones,
      todayStr,
      pendingDraft.deadline
    );
    if (!check.valid) {
      setGeminiError(
        check.error ||
          'Please ensure draft dates are chronological and between today and the deadline.'
      );
      return;
    }

    setPlan((prev) => ({
      ...prev,
      goal: pendingDraft.goal,
      deadline: pendingDraft.deadline,
      isBuiltInExample: false,
      milestones: check.milestones.map((m, idx) => ({
        id: `ms-ai-${Date.now()}-${idx + 1}`,
        label: m.label,
        date: m.date,
        done: false,
      })),
    }));
    setPendingDraft(null);
    setGeminiError(null);
  };

  const handleDiscardDraft = () => {
    setPendingDraft(null);
  };

  // Shared CLI handler to mark station #N done or undone
  const handleMarkStationByIndex = (
    stationIndex: number,
    doneState: boolean
  ): { ok: boolean; message: string } => {
    const targetStation = routeState.stations.find(
      (s) => s.index === stationIndex
    );
    if (!targetStation) {
      return {
        ok: false,
        message: `Station #${stationIndex} does not exist. There are ${routeState.stations.length} stations in the route (run "plan" to view).`,
      };
    }

    setPlan((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m) =>
        m.id === targetStation.id ? { ...m, done: doneState } : m
      ),
    }));

    return {
      ok: true,
      message: doneState
        ? `Marked station #${stationIndex} ("${targetStation.label}") as done.`
        : `Marked station #${stationIndex} ("${targetStation.label}") as unfinished.`,
    };
  };

  const nextSummaryText = routeState.nextStation
    ? `Next: ${routeState.nextStation.label} (${formatShortDate(routeState.nextStation.date)})`
    : routeState.allComplete
      ? 'Route complete'
      : `Due ${formatShortDate(plan.deadline)}`;

  return (
    <div className="min-h-screen w-full bg-[#080B10] text-[#F4F0EA] flex flex-col overflow-x-hidden">
      {/* Quiet Studio Header Bar (Strict 3-Zone Top Bar Contract) */}
      <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3 border-b border-[#F4F0EA]/10 bg-[#080B10]/95 shrink-0">
        {/* Zone 1: Brand Title */}
        <a
          href="#top"
          onClick={(e) => e.preventDefault()}
          className="text-base sm:text-lg font-bold tracking-tight text-[#F4F0EA] whitespace-nowrap shrink-0"
        >
          Deadlockd
        </a>

        {/* Zone 2: Live Studio Countdown & Next Action Readout */}
        <div
          aria-live="polite"
          className="hidden md:flex items-center gap-3 text-xs text-[#C6C0B4] truncate"
        >
          <span className="font-medium text-[#F4F0EA] truncate max-w-[220px]">
            {plan.goal}
          </span>
          <span aria-hidden="true" className="text-[#8A8479]">
            ·
          </span>
          <span
            data-testid="studio-live-countdown"
            className="font-mono tabular-nums text-[#FF5A1F] font-semibold whitespace-nowrap shrink-0"
          >
            {countdown.liveHeadline}
          </span>
          <span aria-hidden="true" className="text-[#8A8479]">
            ·
          </span>
          <span className="font-mono tabular-nums text-[#8A8479] whitespace-nowrap shrink-0">
            Due {formatFullDate(plan.deadline)}
          </span>
          {plan.isBuiltInExample && (
            <>
              <span aria-hidden="true" className="text-[#8A8479]">
                ·
              </span>
              <span className="text-[#8A8479] whitespace-nowrap shrink-0">
                Built-in example
              </span>
            </>
          )}
        </div>

        {/* Zone 3: Terminal Trigger */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => setIsTerminalOpen((v) => !v)}
            aria-expanded={isTerminalOpen}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-mono font-medium inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 border ${
              isTerminalOpen
                ? 'bg-[#F4F0EA] text-[#080B10] border-[#F4F0EA]'
                : 'bg-[#0E131D] text-[#C6C0B4] border-[#F4F0EA]/15 hover:text-[#F4F0EA] hover:border-[#F4F0EA]/30'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            Terminal
          </button>
        </div>
      </header>

      {/* Main Studio Workspace: Preview takes most of the screen; Controls sit beside on wide screens / below on mobile */}
      <main className="flex-1 flex flex-col lg:flex-row w-full max-w-[1600px] mx-auto overflow-x-hidden">
        {/* Left / Primary Stage: Live Wallpaper Preview */}
        <section
          aria-label="Wallpaper preview stage"
          className="flex-1 flex flex-col items-center justify-start lg:justify-center p-3 sm:p-5 lg:p-6 bg-[#06090E] lg:min-h-[calc(100vh-57px)]"
        >
          {/* Mobile live status strip above preview */}
          <div className="w-full max-w-[460px] flex md:hidden items-center justify-between text-xs text-[#8A8479] mb-2.5 px-1">
            <span className="font-mono tabular-nums text-[#FF5A1F] font-semibold">
              {countdown.liveHeadline}
            </span>
            <span className="font-mono tabular-nums">
              {width} × {height} px
            </span>
          </div>

          <WallpaperStage
            plan={plan}
            todayStr={todayStr}
            width={width}
            height={height}
            showClockGuides={showClockGuides}
            onToggleClockGuides={handleToggleClockGuides}
            onOpenFullSize={() => setIsFullSizeOpen(true)}
            nextSummaryText={nextSummaryText}
          />

          {/* Compact caption on smaller screens where the side metadata column is hidden */}
          <div className="mt-2.5 flex xl:hidden flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[#8A8479] text-center">
            <span className="font-mono tabular-nums">
              {width} × {height} PNG
            </span>
            <span aria-hidden="true">·</span>
            <span>{nextSummaryText}</span>
          </div>
        </section>

        {/* Right / Secondary Column: Studio Controls & Editor */}
        <div className="w-full lg:w-[420px] xl:w-[450px] shrink-0 border-t lg:border-t-0 lg:border-l border-[#F4F0EA]/10 bg-[#080B10] p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Primary Two Actions: "Download wallpaper" & "Make it mine" */}
          <section aria-label="Primary actions" className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isExporting}
                onClick={handleDownloadWallpaper}
                className="min-h-[46px] px-4 py-2.5 rounded-xl bg-[#FF5A1F] hover:bg-[#FF5A1F]/90 text-[#080B10] font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4 stroke-[2.25]" />
                {isExporting ? 'Exporting…' : 'Download wallpaper'}
              </button>

              <button
                type="button"
                onClick={() => setIsEditorOpen((v) => !v)}
                aria-expanded={isEditorOpen}
                className={`min-h-[46px] px-4 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 border cursor-pointer ${
                  isEditorOpen
                    ? 'bg-[#F4F0EA] text-[#080B10] border-[#F4F0EA]'
                    : 'bg-[#0E131D] text-[#F4F0EA] border-[#F4F0EA]/20 hover:border-[#F4F0EA]/45'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                Make it mine
              </button>
            </div>

            {/* Post-Export Save/Apply Instructions & Snapshot Notice */}
            {exportReceipt && (
              <div
                role="status"
                data-testid="export-receipt"
                className="p-3.5 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/20 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-mono text-[#F4F0EA] font-semibold truncate">
                    <CheckCircle2 className="w-4 h-4 text-[#FF5A1F] shrink-0" />
                    <span className="truncate">{exportReceipt.filename}</span>
                    <span className="text-[#8A8479] shrink-0">
                      ({exportReceipt.width}×{exportReceipt.height})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExportReceipt(null)}
                    aria-label="Close download instructions"
                    className="text-[#8A8479] hover:text-[#F4F0EA] p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[#C6C0B4] leading-relaxed">
                  {exportReceipt.platformInstructions}
                </p>
                <p className="text-[#8A8479] leading-relaxed">
                  This PNG is a dated snapshot of your route, and your saved plan
                  can be reopened on this device anytime to export an updated
                  image.
                </p>
              </div>
            )}
          </section>

          {/* Plan & Station Editor */}
          <PlanEditorPanel
            plan={plan}
            routeState={routeState}
            todayStr={todayStr}
            isEditorOpen={isEditorOpen}
            onOpenEditor={() => setIsEditorOpen(true)}
            onCloseEditor={() => setIsEditorOpen(false)}
            onUpdateGoalAndDeadline={handleUpdateGoalAndDeadline}
            onToggleMilestoneDone={handleToggleMilestoneDone}
            onUpdateMilestone={handleUpdateMilestone}
            onDeleteMilestone={handleDeleteMilestone}
            onAddMilestone={handleAddMilestone}
            onRequestGeminiSuggestions={async (g, d) => {
              await handleRequestGeminiSuggestions(g, d);
            }}
            isSuggesting={isSuggesting}
            geminiError={geminiError}
            onDismissGeminiError={() => setGeminiError(null)}
            pendingDraft={pendingDraft}
            onUpdateDraftItem={handleUpdateDraftItem}
            onRemoveDraftItem={handleRemoveDraftItem}
            onAcceptDraft={handleAcceptDraft}
            onDiscardDraft={handleDiscardDraft}
            onResetToExample={handleResetToExample}
          />

          {/* Readily Available Output Size + Adjust Fit Disclosure */}
          <TargetScreenControls
            plan={plan}
            onSelectPreset={handleSelectPreset}
            onUpdateCustomSize={handleUpdateCustomSize}
            onSelectOsPreview={handleSelectOsPreview}
            onUpdateOffsets={handleUpdateOffsets}
            onEnsureClockGuidesVisible={() => setShowClockGuides(true)}
          />
        </div>

        {/* Browser CLI Terminal (Beside preview on desktop, bottom drawer on mobile) */}
        <TerminalDrawer
          isOpen={isTerminalOpen}
          onClose={() => setIsTerminalOpen(false)}
          plan={plan}
          routeState={routeState}
          todayStr={todayStr}
          onMarkByIndex={handleMarkStationByIndex}
          onSelectDevicePreset={(preset) => handleSelectPreset(preset)}
          onTriggerExport={handleDownloadWallpaper}
          onTriggerAiDraft={handleRequestGeminiSuggestions}
        />
      </main>

      {/* Full-Size Wallpaper Inspector Modal */}
      {isFullSizeOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full size wallpaper inspector"
          data-testid="full-size-modal"
          className="fixed inset-0 z-50 bg-[#05070B]/95 backdrop-blur-sm flex flex-col"
        >
          {/* Inspector Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-[#F4F0EA]/12 bg-[#080B10]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-[#F4F0EA] truncate">
                {plan.goal}
              </span>
              <span className="text-xs font-mono tabular-nums text-[#8A8479] shrink-0">
                {width} × {height} px PNG
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Zoom Mode Switch: Fit vs 1:1 Actual Pixels */}
              <div className="inline-flex rounded-lg bg-[#0E131D] p-0.5 border border-[#F4F0EA]/15">
                <button
                  type="button"
                  onClick={() => setFullSizeZoom('fit')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    fullSizeZoom === 'fit'
                      ? 'bg-[#F4F0EA] text-[#080B10]'
                      : 'text-[#C6C0B4] hover:text-[#F4F0EA]'
                  }`}
                >
                  Fit to screen
                </button>
                <button
                  type="button"
                  onClick={() => setFullSizeZoom('actual')}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                    fullSizeZoom === 'actual'
                      ? 'bg-[#F4F0EA] text-[#080B10]'
                      : 'text-[#C6C0B4] hover:text-[#F4F0EA]'
                  }`}
                >
                  1:1 Pixels
                </button>
              </div>

              {/* Clock Guide Toggle inside Full-Size Inspector */}
              <button
                type="button"
                role="switch"
                aria-checked={showClockGuides}
                onClick={handleToggleClockGuides}
                className={`min-h-[34px] px-3 py-1 rounded-lg border text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer ${
                  showClockGuides
                    ? 'bg-[#F4F0EA]/12 border-[#F4F0EA]/35 text-[#F4F0EA]'
                    : 'bg-[#0E131D] border-[#F4F0EA]/15 text-[#C6C0B4] hover:text-[#F4F0EA]'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-[#8A8479]" />
                <span>Show clock guides</span>
                <span
                  className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                    showClockGuides
                      ? 'bg-[#FF5A1F] border-[#FF5A1F] text-[#080B10]'
                      : 'bg-[#080B10] border-[#F4F0EA]/25 text-transparent'
                  }`}
                >
                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                </span>
              </button>

              <button
                type="button"
                disabled={isExporting}
                onClick={handleDownloadWallpaper}
                className="min-h-[34px] px-3.5 py-1 rounded-lg bg-[#FF5A1F] hover:bg-[#FF5A1F]/90 text-[#080B10] font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 stroke-[2.25]" />
                <span>Download PNG</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFullSizeOpen(false)}
                aria-label="Close full size preview"
                className="min-h-[34px] px-2.5 py-1 rounded-lg bg-[#0E131D] border border-[#F4F0EA]/15 text-[#C6C0B4] hover:text-[#F4F0EA] inline-flex items-center gap-1 text-xs font-medium cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Full-Resolution Canvas Viewport */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4 sm:p-6">
            <div
              className={`relative rounded-xl overflow-hidden border border-[#F4F0EA]/20 bg-[#0B0F17] shadow-2xl ${
                fullSizeZoom === 'fit'
                  ? 'max-h-[calc(100vh-88px)] max-w-[calc(100vw-48px)]'
                  : ''
              }`}
              style={
                fullSizeZoom === 'fit'
                  ? { aspectRatio: `${width} / ${height}`, height: '100%' }
                  : { width: `${width}px`, height: `${height}px` }
              }
            >
              <canvas
                ref={fullSizeCanvasRef}
                width={width}
                height={height}
                className="block w-full h-full object-contain"
              />
              <canvas
                ref={fullSizeOverlayRef}
                width={width}
                height={height}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 block w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
