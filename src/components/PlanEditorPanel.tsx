import React, { useState, useEffect } from 'react';
import {
  DeadlockdPlan,
  DerivedRouteState,
  DraftMilestoneItem,
  Milestone,
} from '../utils/planLogic';
import {
  addDaysToDateStr,
  formatShortDate,
  isValidDateStr,
} from '../utils/dateUtils';
import {
  Check,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';

export interface PendingGeminiDraft {
  goal: string;
  deadline: string;
  milestones: DraftMilestoneItem[];
}

interface PlanEditorPanelProps {
  plan: DeadlockdPlan;
  routeState: DerivedRouteState;
  todayStr: string;
  isEditorOpen: boolean;
  onOpenEditor: () => void;
  onCloseEditor: () => void;
  onUpdateGoalAndDeadline: (goal: string, deadline: string) => void;
  onToggleMilestoneDone: (id: string) => void;
  onUpdateMilestone: (id: string, label: string, date: string) => void;
  onDeleteMilestone: (id: string) => void;
  onAddMilestone: (label: string, date: string) => void;
  onRequestGeminiSuggestions: (goal: string, deadline: string) => Promise<void>;
  isSuggesting: boolean;
  geminiError: string | null;
  onDismissGeminiError: () => void;
  pendingDraft: PendingGeminiDraft | null;
  onUpdateDraftItem: (index: number, label: string, date: string) => void;
  onRemoveDraftItem: (index: number) => void;
  onAcceptDraft: () => void;
  onDiscardDraft: () => void;
  onResetToExample: () => void;
}

export const PlanEditorPanel: React.FC<PlanEditorPanelProps> = ({
  plan,
  routeState,
  todayStr,
  isEditorOpen,
  onOpenEditor,
  onCloseEditor,
  onUpdateGoalAndDeadline,
  onToggleMilestoneDone,
  onUpdateMilestone,
  onDeleteMilestone,
  onAddMilestone,
  onRequestGeminiSuggestions,
  isSuggesting,
  geminiError,
  onDismissGeminiError,
  pendingDraft,
  onUpdateDraftItem,
  onRemoveDraftItem,
  onAcceptDraft,
  onDiscardDraft,
  onResetToExample,
}) => {
  const [goalInput, setGoalInput] = useState(plan.goal);
  const [deadlineInput, setDeadlineInput] = useState(plan.deadline);
  const [formError, setFormError] = useState<string | null>(null);

  const [newStepLabel, setNewStepLabel] = useState('');
  const [newStepDate, setNewStepDate] = useState(() =>
    addDaysToDateStr(todayStr, 2)
  );
  const [showAddRow, setShowAddRow] = useState(false);

  useEffect(() => {
    setGoalInput(plan.goal);
    setDeadlineInput(plan.deadline);
  }, [plan.goal, plan.deadline]);

  const validateRequiredFields = (): { valid: boolean; goal: string; deadline: string } => {
    const trimmedGoal = goalInput.trim();
    const trimmedDeadline = deadlineInput.trim();
    if (!trimmedGoal) {
      setFormError('Enter a goal title.');
      return { valid: false, goal: '', deadline: '' };
    }
    if (!isValidDateStr(trimmedDeadline)) {
      setFormError('Enter a valid deadline date (YYYY-MM-DD).');
      return { valid: false, goal: '', deadline: '' };
    }
    setFormError(null);
    return { valid: true, goal: trimmedGoal, deadline: trimmedDeadline };
  };

  const handleGoalBlurOrSave = () => {
    const check = validateRequiredFields();
    if (!check.valid) return;
    if (check.goal !== plan.goal || check.deadline !== plan.deadline) {
      onUpdateGoalAndDeadline(check.goal, check.deadline);
    }
  };

  const handleSuggestClick = async () => {
    const check = validateRequiredFields();
    if (!check.valid) return;
    await onRequestGeminiSuggestions(check.goal, check.deadline);
  };

  const handleStartManual = () => {
    const check = validateRequiredFields();
    if (!check.valid) return;
    onUpdateGoalAndDeadline(check.goal, check.deadline);
    setShowAddRow(true);
  };

  const handleAddMilestoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newStepLabel.trim();
    if (!trimmed) return;
    if (!isValidDateStr(newStepDate)) return;
    onAddMilestone(trimmed, newStepDate);
    setNewStepLabel('');
    setShowAddRow(false);
  };

  return (
    <div className="space-y-5">
      {/* Make It Mine / Goal & Deadline Editor Sheet */}
      {isEditorOpen && (
        <section
          aria-label="Make it mine plan editor"
          className="p-4 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/15 space-y-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#F4F0EA]">
                Make it mine
              </h2>
              <p className="text-xs text-[#8A8479]">
                Set your goal and deadline, then generate or edit your route.
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseEditor}
              aria-label="Close plan editor"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#8A8479] hover:text-[#F4F0EA] hover:bg-[#F4F0EA]/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="goal-input"
                className="block text-xs font-medium text-[#C6C0B4] mb-1"
              >
                Goal <span className="text-[#FF5A1F]">*</span>
              </label>
              <input
                id="goal-input"
                autoFocus
                type="text"
                required
                value={goalInput}
                onChange={(e) => {
                  setGoalInput(e.target.value);
                  if (formError) setFormError(null);
                }}
                onBlur={handleGoalBlurOrSave}
                placeholder="e.g. Ship v1 mobile app"
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[#080B10] border border-[#F4F0EA]/15 text-sm text-[#F4F0EA] placeholder-[#8A8479]/60 focus:outline-none focus:border-[#FF5A1F]"
              />
            </div>

            <div>
              <label
                htmlFor="deadline-input"
                className="block text-xs font-medium text-[#C6C0B4] mb-1"
              >
                Deadline <span className="text-[#FF5A1F]">*</span>
              </label>
              <input
                id="deadline-input"
                type="date"
                required
                value={deadlineInput}
                onChange={(e) => {
                  setDeadlineInput(e.target.value);
                  if (formError) setFormError(null);
                  if (isValidDateStr(e.target.value) && goalInput.trim()) {
                    onUpdateGoalAndDeadline(goalInput.trim(), e.target.value);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg bg-[#080B10] border border-[#F4F0EA]/15 text-sm font-mono tabular-nums text-[#F4F0EA] focus:outline-none focus:border-[#FF5A1F]"
              />
            </div>

            {formError && (
              <p role="alert" className="text-xs text-[#FF5A1F] font-medium">
                {formError}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={isSuggesting}
                onClick={handleSuggestClick}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg bg-[#F4F0EA] text-[#080B10] hover:bg-[#F4F0EA]/90 disabled:opacity-50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#FF5A1F] shrink-0" />
                {isSuggesting
                  ? 'Suggesting route…'
                  : 'Suggest milestones with Gemini'}
              </button>

              <button
                type="button"
                onClick={handleStartManual}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-lg bg-[#080B10] border border-[#F4F0EA]/20 text-[#F4F0EA] hover:border-[#F4F0EA]/40 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                Add milestones myself
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Gemini Error Notice (Preserves current plan and offers manual editing) */}
      {geminiError && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-[#1A1215] border border-[#FF5A1F]/50 text-xs text-[#F4F0EA] space-y-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="leading-relaxed text-[#F4F0EA]">{geminiError}</p>
            <button
              type="button"
              onClick={onDismissGeminiError}
              aria-label="Dismiss Gemini notice"
              className="text-[#8A8479] hover:text-[#F4F0EA] p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                onDismissGeminiError();
                onOpenEditor();
                setShowAddRow(true);
              }}
              className="text-xs font-semibold text-[#FF5A1F] hover:underline"
            >
              Add milestones manually →
            </button>
          </div>
        </div>
      )}

      {/* Reviewable Gemini Suggestion Draft */}
      {pendingDraft && (
        <section
          aria-label="Suggested milestones draft"
          className="p-4 rounded-xl bg-[#131A28] border border-[#FF5A1F] space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-[#FF5A1F] font-semibold">
                REVIEW SUGGESTED DRAFT
              </div>
              <div className="text-xs text-[#C6C0B4] mt-0.5">
                {pendingDraft.goal} · Due {formatShortDate(pendingDraft.deadline)}
              </div>
            </div>
          </div>

          <p className="text-xs text-[#8A8479]">
            Edit any label or date below before applying to your wallpaper.
          </p>

          <div className="space-y-2">
            {pendingDraft.milestones.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-[#080B10] p-2 rounded-lg border border-[#F4F0EA]/10"
              >
                <span className="text-xs font-mono tabular-nums text-[#8A8479] w-5 text-center">
                  {idx + 1}
                </span>
                <input
                  type="text"
                  aria-label={`Draft milestone ${idx + 1} label`}
                  value={item.label}
                  maxLength={60}
                  onChange={(e) =>
                    onUpdateDraftItem(idx, e.target.value, item.date)
                  }
                  className="flex-1 min-w-0 bg-transparent text-xs text-[#F4F0EA] focus:outline-none border-b border-transparent focus:border-[#FF5A1F] py-1"
                />
                <input
                  type="date"
                  aria-label={`Draft milestone ${idx + 1} date`}
                  value={item.date}
                  min={todayStr}
                  max={pendingDraft.deadline}
                  onChange={(e) =>
                    onUpdateDraftItem(idx, item.label, e.target.value)
                  }
                  className="w-[122px] bg-[#0E131D] px-2 py-1 rounded text-[11px] font-mono tabular-nums text-[#C6C0B4] border border-[#F4F0EA]/10 focus:outline-none focus:border-[#FF5A1F]"
                />
                {pendingDraft.milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveDraftItem(idx)}
                    aria-label={`Remove draft milestone ${idx + 1}`}
                    className="p-1.5 text-[#8A8479] hover:text-[#FF5A1F]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onAcceptDraft}
              className="flex-1 min-h-[42px] px-3 py-2 rounded-lg bg-[#FF5A1F] hover:bg-[#FF5A1F]/90 text-[#080B10] font-semibold text-xs transition-colors"
            >
              Accept suggested milestones
            </button>
            <button
              type="button"
              onClick={onDiscardDraft}
              className="min-h-[42px] px-3 py-2 rounded-lg bg-[#080B10] border border-[#F4F0EA]/15 text-[#C6C0B4] hover:text-[#F4F0EA] text-xs font-medium transition-colors"
            >
              Keep current plan
            </button>
          </div>
        </section>
      )}

      {/* Active Route Stations List (Edit labels, dates, mark done/undo, delete, add) */}
      <section aria-label="Route stations" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-[#C6C0B4]">
              Stations ({routeState.completedCount}/{routeState.totalCount} done)
            </h3>
            {plan.isBuiltInExample && (
              <span className="text-[11px] text-[#8A8479]">
                · Built-in example
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {!plan.isBuiltInExample && (
              <button
                type="button"
                onClick={onResetToExample}
                className="text-[11px] text-[#8A8479] hover:text-[#F4F0EA] transition-colors"
              >
                Load example
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddRow((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#FF5A1F] hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add stop
            </button>
          </div>
        </div>

        {/* Add New Milestone Form */}
        {showAddRow && (
          <form
            onSubmit={handleAddMilestoneSubmit}
            className="p-3 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/15 space-y-2.5"
          >
            <div className="text-xs font-medium text-[#F4F0EA]">
              New milestone stop
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                aria-label="New milestone label"
                placeholder="e.g. Record a 90-sec demo"
                maxLength={60}
                value={newStepLabel}
                onChange={(e) => setNewStepLabel(e.target.value)}
                className="flex-1 min-h-[40px] px-3 py-1.5 rounded-lg bg-[#080B10] border border-[#F4F0EA]/15 text-xs text-[#F4F0EA] focus:outline-none focus:border-[#FF5A1F]"
              />
              <input
                type="date"
                aria-label="New milestone date"
                value={newStepDate}
                onChange={(e) => setNewStepDate(e.target.value)}
                className="sm:w-[136px] min-h-[40px] px-2.5 py-1.5 rounded-lg bg-[#080B10] border border-[#F4F0EA]/15 text-xs font-mono tabular-nums text-[#F4F0EA] focus:outline-none focus:border-[#FF5A1F]"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddRow(false)}
                className="min-h-[36px] px-3 py-1 rounded-lg text-xs text-[#8A8479] hover:text-[#F4F0EA]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="min-h-[36px] px-3.5 py-1 rounded-lg bg-[#FF5A1F] text-[#080B10] font-semibold text-xs"
              >
                Save stop
              </button>
            </div>
          </form>
        )}

        {/* Chronological Station Rows */}
        {routeState.stations.length === 0 ? (
          <div className="p-4 rounded-xl bg-[#0E131D] border border-[#F4F0EA]/10 text-xs text-[#8A8479] flex items-center justify-between">
            <span>No intermediate stops yet. Add one or ask Gemini.</span>
            <button
              type="button"
              onClick={() => setShowAddRow(true)}
              className="text-[#FF5A1F] font-semibold hover:underline ml-2 shrink-0"
            >
              Add first stop
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {routeState.stations.map((st) => {
              const isNext = st.role === 'next';
              const isDone = st.role === 'completed';

              return (
                <div
                  key={st.id}
                  className={`group flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
                    isNext
                      ? 'bg-[#FF5A1F]/10 border-[#FF5A1F]/60'
                      : isDone
                        ? 'bg-[#0B0F17] border-[#F4F0EA]/10'
                        : 'bg-[#0E131D] border-[#F4F0EA]/10 hover:border-[#F4F0EA]/20'
                  }`}
                >
                  {/* Visible Check-Circle Button */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    data-testid={`toggle-stop-${st.index}`}
                    onClick={() => onToggleMilestoneDone(st.id)}
                    title={
                      isDone
                        ? `Undo ${st.label}`
                        : `Mark ${st.label} complete`
                    }
                    aria-label={
                      isDone
                        ? `Undo ${st.label} completion`
                        : `Mark ${st.label} complete`
                    }
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F4F0EA]"
                  >
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isDone
                          ? 'bg-[#F4F0EA] text-[#080B10] border-2 border-[#F4F0EA]'
                          : isNext
                            ? 'border-2 border-[#FF5A1F] bg-[#FF5A1F]/15 text-[#FF5A1F] ring-4 ring-[#FF5A1F]/20 group-hover:bg-[#FF5A1F] group-hover:text-[#080B10]'
                            : 'border-2 border-[#C6C0B4]/50 bg-[#080B10] text-[#8A8479]/80 group-hover:border-[#F4F0EA] group-hover:text-[#F4F0EA]'
                      }`}
                    >
                      {isDone && <Check aria-hidden="true" className="w-4 h-4 stroke-[2.8]" />}
                    </span>
                  </button>

                  {/* Editable Label & Role Status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-mono tabular-nums font-semibold tracking-wide ${
                          isNext
                            ? 'text-[#FF5A1F]'
                            : isDone
                              ? 'text-[#C6C0B4]'
                              : 'text-[#8A8479]'
                        }`}
                      >
                        {isNext
                          ? `0${st.index} · NEXT`
                          : isDone
                            ? `0${st.index} · DONE`
                            : `0${st.index} · STOP`}
                      </span>
                      {isDone && (
                        <button
                          type="button"
                          onClick={() => onToggleMilestoneDone(st.id)}
                          aria-label={`Undo ${st.label}`}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#F4F0EA]/12 hover:bg-[#F4F0EA]/20 text-[10px] font-medium text-[#F4F0EA] transition-colors cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Undo
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      aria-label={`Milestone ${st.index} label`}
                      value={st.label}
                      maxLength={60}
                      onChange={(e) =>
                        onUpdateMilestone(st.id, e.target.value, st.date)
                      }
                      className={`w-full bg-transparent text-xs font-medium focus:outline-none border-b border-transparent focus:border-[#FF5A1F] py-0.5 truncate ${
                        isDone
                          ? 'line-through text-[#8A8479]'
                          : 'text-[#F4F0EA]'
                      }`}
                    />
                  </div>

                  {/* Editable Date */}
                  <input
                    type="date"
                    aria-label={`Milestone ${st.index} date`}
                    value={st.date}
                    onChange={(e) => {
                      if (isValidDateStr(e.target.value)) {
                        onUpdateMilestone(st.id, st.label, e.target.value);
                      }
                    }}
                    className="w-[114px] sm:w-[122px] min-h-[36px] px-1.5 py-1 rounded bg-[#080B10] border border-[#F4F0EA]/10 text-[11px] font-mono tabular-nums text-[#C6C0B4] focus:outline-none focus:border-[#FF5A1F] shrink-0"
                  />

                  {/* Remove Milestone Button (quieter than completion check) */}
                  <button
                    type="button"
                    onClick={() => onDeleteMilestone(st.id)}
                    aria-label={`Delete ${st.label}`}
                    title={`Delete ${st.label}`}
                    className="min-h-[36px] min-w-[32px] inline-flex items-center justify-center rounded-lg text-[#8A8479]/50 hover:text-[#FF5A1F] hover:bg-[#FF5A1F]/10 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
