const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface CountdownStripItem {
  rawDate: string;
  dateLabel: string;
  daysLeft: number;
  daysLeftLabel: string;
  pairText: string;
}

export interface CountdownSummary {
  status: 'complete' | 'due-today' | 'overdue' | 'active';
  daysRemaining: number;
  liveHeadline: string;
  snapshotLabel: string;
  strip: CountdownStripItem[];
}

/**
 * Returns local calendar date (YYYY-MM-DD) in the specified IANA timeZone.
 * Falls back safely to local system date if timeZone is invalid.
 */
export function getTodayInTimeZone(timeZone?: string, now: Date = new Date()): string {
  try {
    const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);

    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Fallback to local getters
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks whether a string is a valid real calendar date in YYYY-MM-DD format.
 */
export function isValidDateStr(dateStr: string): boolean {
  if (typeof dateStr !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

/**
 * Converts YYYY-MM-DD to UTC midnight timestamp for timezone-immune day math.
 */
export function parseDateStrToUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Adds a signed integer number of calendar days to a YYYY-MM-DD string.
 */
export function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const ms = parseDateStrToUtcMs(dateStr);
  const target = new Date(ms + daysToAdd * 86_400_000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Computes exact calendar days from `fromDateStr` to `toDateStr` (to - from).
 */
export function diffCalendarDays(fromDateStr: string, toDateStr: string): number {
  const fromMs = parseDateStrToUtcMs(fromDateStr);
  const toMs = parseDateStrToUtcMs(toDateStr);
  return Math.round((toMs - fromMs) / 86_400_000);
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Formats YYYY-MM-DD as "Nov 7" or "Nov 21".
 */
export function formatShortDate(dateStr: string): string {
  if (!isValidDateStr(dateStr)) return dateStr;
  const [, m, d] = dateStr.split('-').map(Number);
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

/**
 * Formats YYYY-MM-DD as "Wed, Nov 11" so simulated OS lock-screen clocks match the preview date.
 */
export function formatWeekdayShortDate(dateStr: string): string {
  if (!isValidDateStr(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = SHORT_WEEKDAYS[dt.getUTCDay()];
  return `${weekday}, ${SHORT_MONTHS[m - 1]} ${d}`;
}

/**
 * Formats YYYY-MM-DD as "Nov 21, 2026".
 */
export function formatFullDate(dateStr: string, referenceYear?: number): string {
  if (!isValidDateStr(dateStr)) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (referenceYear && y === referenceYear) {
    return `${SHORT_MONTHS[m - 1]} ${d}`;
  }
  return `${SHORT_MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Builds the countdown summary and 7-day date strip for both studio and PNG wallpaper.
 * - On deadline day: shows "Due today"
 * - When all milestones are complete: shows "Route complete"
 * - When overdue: shows overdue count clearly
 * - When days remain: builds a compact strip pairing up to the next 7 dates with remaining-day counts,
 *   ending early at the deadline (e.g., a Nov 21 deadline on Nov 7 gives "Nov 7 · 14d", "Nov 8 · 13d", ...).
 *   Also provides a clearly dated snapshot fallback such as "14 days left on Nov 7".
 */
export function buildCountdownSummary(
  todayStr: string,
  deadlineStr: string,
  allComplete: boolean
): CountdownSummary {
  const daysRemaining = diffCalendarDays(todayStr, deadlineStr);
  const shortToday = formatShortDate(todayStr);

  if (allComplete) {
    return {
      status: 'complete',
      daysRemaining,
      liveHeadline: 'Route complete',
      snapshotLabel: 'Route complete',
      strip: [],
    };
  }

  if (daysRemaining === 0) {
    return {
      status: 'due-today',
      daysRemaining: 0,
      liveHeadline: 'Due today',
      snapshotLabel: `Due today · ${shortToday}`,
      strip: [
        {
          rawDate: todayStr,
          dateLabel: shortToday,
          daysLeft: 0,
          daysLeftLabel: 'Due today',
          pairText: `${shortToday} · Due today`,
        },
      ],
    };
  }

  if (daysRemaining < 0) {
    const overdueDays = Math.abs(daysRemaining);
    const unit = overdueDays === 1 ? 'day' : 'days';
    return {
      status: 'overdue',
      daysRemaining,
      liveHeadline: `${overdueDays} ${unit} overdue`,
      snapshotLabel: `${overdueDays} ${unit} overdue on ${shortToday}`,
      strip: [],
    };
  }

  const unit = daysRemaining === 1 ? 'day' : 'days';
  const liveHeadline = `${daysRemaining} ${unit} left`;
  const snapshotLabel = `${daysRemaining} ${unit} left on ${shortToday}`;

  // Pair up to the next 7 dates with their remaining-day counts, ending early at the deadline.
  // Note: If deadline is within 6 days, we stop at the deadline date (including or ending at 1d / Due).
  const maxEntries = Math.min(7, daysRemaining);
  const strip: CountdownStripItem[] = [];
  for (let i = 0; i < maxEntries; i++) {
    const curDate = addDaysToDateStr(todayStr, i);
    const rem = daysRemaining - i;
    const dateLabel = formatShortDate(curDate);
    const daysLeftLabel = `${rem}d`;
    strip.push({
      rawDate: curDate,
      dateLabel,
      daysLeft: rem,
      daysLeftLabel,
      pairText: `${dateLabel} · ${daysLeftLabel}`,
    });
  }

  return {
    status: 'active',
    daysRemaining,
    liveHeadline,
    snapshotLabel,
    strip,
  };
}
