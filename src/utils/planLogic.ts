import {
  addDaysToDateStr,
  diffCalendarDays,
  getTodayInTimeZone,
  isValidDateStr,
} from './dateUtils';

export type DevicePresetId = 'phone' | 'tall-phone' | 'laptop' | 'desktop' | 'custom';
export type OsPreviewId = 'iphone' | 'android' | 'macos' | 'windows' | 'none';

export interface DevicePresetSpec {
  id: DevicePresetId;
  label: string;
  shortLabel: string;
  width: number;
  height: number;
  defaultOs: OsPreviewId;
  platformHint: 'ios' | 'android' | 'desktop';
}

export const DEVICE_PRESETS: Record<Exclude<DevicePresetId, 'custom'>, DevicePresetSpec> = {
  phone: {
    id: 'phone',
    label: 'Phone (1080 × 1920)',
    shortLabel: 'Phone',
    width: 1080,
    height: 1920,
    defaultOs: 'iphone',
    platformHint: 'ios',
  },
  'tall-phone': {
    id: 'tall-phone',
    label: 'Tall phone (1080 × 2400)',
    shortLabel: 'Tall phone',
    width: 1080,
    height: 2400,
    defaultOs: 'android',
    platformHint: 'android',
  },
  laptop: {
    id: 'laptop',
    label: 'Laptop (2560 × 1600)',
    shortLabel: 'Laptop',
    width: 2560,
    height: 1600,
    defaultOs: 'macos',
    platformHint: 'desktop',
  },
  desktop: {
    id: 'desktop',
    label: 'Desktop (3840 × 2160)',
    shortLabel: 'Desktop',
    width: 3840,
    height: 2160,
    defaultOs: 'windows',
    platformHint: 'desktop',
  },
};

export const MIN_DIMENSION_PX = 360;
export const MAX_DIMENSION_PX = 6000;
export const MAX_PIXEL_BUDGET = 16_777_216; // 4096 x 4096 (16.7 MP safe browser canvas budget)

export interface Milestone {
  id: string;
  label: string;
  date: string; // YYYY-MM-DD
  done: boolean;
}

export interface DeadlockdPlan {
  goal: string;
  deadline: string; // YYYY-MM-DD
  createdAtDate: string; // YYYY-MM-DD
  timeZone: string;
  isBuiltInExample: boolean;
  milestones: Milestone[];
  preset: DevicePresetId;
  customWidth: number;
  customHeight: number;
  osPreview: OsPreviewId;
  routeOffsetY: number; // -100 to 100
  routeOffsetX: number; // -100 to 100
}

export type StationRole = 'completed' | 'next' | 'upcoming';

export interface RouteStation extends Milestone {
  index: number; // 1-based chronological order
  role: StationRole;
}

export interface DerivedRouteState {
  stations: RouteStation[];
  nextStation: RouteStation | null;
  allComplete: boolean;
  completedCount: number;
  totalCount: number;
}

export const STORAGE_KEY = 'deadlockd_saved_plan_v1';

/**
 * Generates the built-in example plan on first visit:
 * - Goal: "My first portfolio review"
 * - Deadline: 14 calendar days ahead of creation
 * - 4 dated milestones scheduled 1, 5, 10, and 13 days from creation:
 *   1. "Pick two projects" (+1d)
 *   2. "Write case studies" (+5d)
 *   3. "Rehearse my intro" (+10d)
 *   4. "Pack portfolio" (+13d)
 */
export function createDefaultExamplePlan(
  now: Date = new Date(),
  timeZone?: string
): DeadlockdPlan {
  const resolvedTz =
    timeZone ||
    (typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC') ||
    'UTC';
  const todayStr = getTodayInTimeZone(resolvedTz, now);
  const deadlineStr = addDaysToDateStr(todayStr, 14);

  return {
    goal: 'My first portfolio review',
    deadline: deadlineStr,
    createdAtDate: todayStr,
    timeZone: resolvedTz,
    isBuiltInExample: true,
    milestones: [
      {
        id: 'ms-1',
        label: 'Pick two projects',
        date: addDaysToDateStr(todayStr, 1),
        done: false,
      },
      {
        id: 'ms-2',
        label: 'Write case studies',
        date: addDaysToDateStr(todayStr, 5),
        done: false,
      },
      {
        id: 'ms-3',
        label: 'Rehearse my intro',
        date: addDaysToDateStr(todayStr, 10),
        done: false,
      },
      {
        id: 'ms-4',
        label: 'Pack portfolio',
        date: addDaysToDateStr(todayStr, 13),
        done: false,
      },
    ],
    preset: 'phone',
    customWidth: 1440,
    customHeight: 2560,
    osPreview: 'iphone',
    routeOffsetY: 0,
    routeOffsetX: 0,
  };
}

/**
 * Sorts milestones chronologically by date (preserving relative order for same-day milestones)
 * and derives the station roles:
 * - Earliest unfinished milestone is marked 'next'
 * - Completed milestones are marked 'completed'
 * - Subsequent unfinished milestones are marked 'upcoming'
 */
export function deriveRouteState(plan: DeadlockdPlan): DerivedRouteState {
  const indexed = plan.milestones.map((m, idx) => ({ m, idx }));
  indexed.sort((a, b) => {
    if (a.m.date !== b.m.date) {
      return a.m.date.localeCompare(b.m.date);
    }
    return a.idx - b.idx;
  });

  let foundNext = false;
  let nextStation: RouteStation | null = null;
  let completedCount = 0;

  const stations: RouteStation[] = indexed.map(({ m }, sortedIdx) => {
    let role: StationRole;
    if (m.done) {
      role = 'completed';
      completedCount++;
    } else if (!foundNext) {
      role = 'next';
      foundNext = true;
    } else {
      role = 'upcoming';
    }

    const station: RouteStation = {
      ...m,
      index: sortedIdx + 1,
      role,
    };
    if (role === 'next') {
      nextStation = station;
    }
    return station;
  });

  const totalCount = stations.length;
  const allComplete = totalCount > 0 && completedCount === totalCount;

  return {
    stations,
    nextStation,
    allComplete,
    completedCount,
    totalCount,
  };
}

/**
 * Resolves pixel dimensions for any preset or custom dimension setting.
 */
export function resolveOutputDimensions(plan: DeadlockdPlan): {
  width: number;
  height: number;
} {
  if (plan.preset === 'custom') {
    const check = validateCustomDimensions(plan.customWidth, plan.customHeight);
    return { width: check.width, height: check.height };
  }
  const spec = DEVICE_PRESETS[plan.preset];
  return { width: spec.width, height: spec.height };
}

/**
 * Validates user-entered custom width and height against dimension and pixel-budget limits.
 */
export function validateCustomDimensions(
  rawWidth: number,
  rawHeight: number
): {
  valid: boolean;
  error?: string;
  width: number;
  height: number;
} {
  const w = Math.round(Number(rawWidth) || 0);
  const h = Math.round(Number(rawHeight) || 0);

  if (w < MIN_DIMENSION_PX || h < MIN_DIMENSION_PX) {
    return {
      valid: false,
      error: `Minimum size is ${MIN_DIMENSION_PX} × ${MIN_DIMENSION_PX} px so route labels stay legible.`,
      width: Math.max(MIN_DIMENSION_PX, w || 1080),
      height: Math.max(MIN_DIMENSION_PX, h || 1920),
    };
  }

  if (w > MAX_DIMENSION_PX || h > MAX_DIMENSION_PX) {
    return {
      valid: false,
      error: `Maximum dimension is ${MAX_DIMENSION_PX} px per side.`,
      width: Math.min(MAX_DIMENSION_PX, w),
      height: Math.min(MAX_DIMENSION_PX, h),
    };
  }

  const pixels = w * h;
  if (pixels > MAX_PIXEL_BUDGET) {
    const mp = (pixels / 1_000_000).toFixed(1);
    const maxMp = (MAX_PIXEL_BUDGET / 1_000_000).toFixed(1);
    return {
      valid: false,
      error: `${w} × ${h} (${mp} MP) exceeds the ${maxMp} MP browser memory budget. Reduce width or height.`,
      width: 3840,
      height: 2160,
    };
  }

  return { valid: true, width: w, height: h };
}

export interface DraftMilestoneItem {
  label: string;
  date: string;
}

export interface DraftValidationResult {
  valid: boolean;
  error?: string;
  milestones: DraftMilestoneItem[];
}

/**
 * Validates Gemini-suggested milestones before displaying them to the user:
 * - Must be non-empty array of up to 5 items
 * - Each label must be non-empty string (trimmed)
 * - Dates must be real calendar dates (YYYY-MM-DD)
 * - Dates must be between todayStr and deadlineStr inclusive
 * - Dates must be in chronological order
 */
export function validateSuggestedMilestones(
  rawItems: unknown,
  todayStr: string,
  deadlineStr: string
): DraftValidationResult {
  if (!isValidDateStr(todayStr) || !isValidDateStr(deadlineStr)) {
    return {
      valid: false,
      error: 'Goal deadline must be a valid YYYY-MM-DD date.',
      milestones: [],
    };
  }

  if (diffCalendarDays(todayStr, deadlineStr) < 0) {
    return {
      valid: false,
      error: 'Deadline must be today or in the future to suggest milestones.',
      milestones: [],
    };
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      valid: false,
      error: 'No valid milestones were returned by Gemini.',
      milestones: [],
    };
  }

  if (rawItems.length > 5) {
    return {
      valid: false,
      error: 'Gemini returned more than the maximum of 5 milestones.',
      milestones: [],
    };
  }

  const validated: DraftMilestoneItem[] = [];
  let prevDate = '';

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i] as Record<string, unknown> | null;
    if (!item || typeof item !== 'object') {
      return {
        valid: false,
        error: `Milestone #${i + 1} is malformed.`,
        milestones: [],
      };
    }

    const rawLabel = typeof item.label === 'string' ? item.label.trim() : '';
    const rawDate = typeof item.date === 'string' ? item.date.trim() : '';

    if (!rawLabel) {
      return {
        valid: false,
        error: `Milestone #${i + 1} is missing an action label.`,
        milestones: [],
      };
    }

    if (!isValidDateStr(rawDate)) {
      return {
        valid: false,
        error: `Milestone "${rawLabel}" has an invalid calendar date (${rawDate}).`,
        milestones: [],
      };
    }

    if (rawDate < todayStr || rawDate > deadlineStr) {
      return {
        valid: false,
        error: `Milestone "${rawLabel}" (${rawDate}) falls outside ${todayStr} to ${deadlineStr}.`,
        milestones: [],
      };
    }

    if (prevDate && rawDate < prevDate) {
      return {
        valid: false,
        error: `Milestones are not in chronological order (${rawDate} is before ${prevDate}).`,
        milestones: [],
      };
    }

    prevDate = rawDate;
    validated.push({
      label: rawLabel.slice(0, 60),
      date: rawDate,
    });
  }

  return {
    valid: true,
    milestones: validated,
  };
}

/**
 * Generates a descriptive PNG filename such as `deadlockd-portfolio-review-phone.png`.
 */
export function buildExportFilename(
  goal: string,
  preset: DevicePresetId,
  width?: number,
  height?: number
): string {
  const words = goal
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  // Strip common conversational prefixes like "my", "first", "a", "the" when there are enough descriptive words
  const stopWords = new Set(['my', 'first', 'a', 'an', 'the', 'our']);
  let filtered = words.filter((w, idx) => !(idx < 2 && stopWords.has(w)));
  if (filtered.length === 0) {
    filtered = words;
  }

  const goalSlug =
    filtered.slice(0, 4).join('-').replace(/-+/g, '-') || 'deadline';
  const presetSlug =
    preset === 'custom' && width && height ? `${width}x${height}` : preset;

  return `deadlockd-${goalSlug}-${presetSlug}.png`;
}

/**
 * Loads a saved DeadlockdPlan from localStorage, or initializes and saves the built-in example on first visit.
 */
export function loadOrCreatePlan(): DeadlockdPlan {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createDefaultExamplePlan();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DeadlockdPlan>;
      if (
        parsed &&
        typeof parsed.goal === 'string' &&
        isValidDateStr(parsed.deadline || '') &&
        Array.isArray(parsed.milestones)
      ) {
        return {
          goal: parsed.goal,
          deadline: parsed.deadline!,
          createdAtDate: isValidDateStr(parsed.createdAtDate || '')
            ? parsed.createdAtDate!
            : getTodayInTimeZone(parsed.timeZone),
          timeZone:
            parsed.timeZone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            'UTC',
          isBuiltInExample: Boolean(parsed.isBuiltInExample),
          milestones: parsed.milestones
            .filter(
              (m): m is Milestone =>
                Boolean(
                  m &&
                    typeof m.label === 'string' &&
                    isValidDateStr(m.date || '')
                )
            )
            .map((m, idx) => ({
              id: m.id || `ms-${idx + 1}`,
              label: m.label,
              date: m.date,
              done: Boolean(m.done),
            })),
          preset:
            parsed.preset &&
            ['phone', 'tall-phone', 'laptop', 'desktop', 'custom'].includes(
              parsed.preset
            )
              ? parsed.preset
              : 'phone',
          customWidth: Number(parsed.customWidth) || 1440,
          customHeight: Number(parsed.customHeight) || 2560,
          osPreview:
            parsed.osPreview &&
            ['iphone', 'android', 'macos', 'windows', 'none'].includes(
              parsed.osPreview
            )
              ? parsed.osPreview
              : 'iphone',
          routeOffsetY: Number(parsed.routeOffsetY) || 0,
          routeOffsetX: Number(parsed.routeOffsetX) || 0,
        };
      }
    }
  } catch {
    // Ignore storage read errors and create fresh default example
  }

  const example = createDefaultExamplePlan();
  savePlanToStorage(example);
  return example;
}

export function savePlanToStorage(plan: DeadlockdPlan): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Ignore quota errors
  }
}
