import {
  buildCountdownSummary,
  CountdownSummary,
  formatFullDate,
  formatShortDate,
  formatWeekdayShortDate,
} from './dateUtils';
import {
  DeadlockdPlan,
  DerivedRouteState,
  deriveRouteState,
  OsPreviewId,
} from './planLogic';

export interface WallpaperLayoutMetrics {
  width: number;
  height: number;
  orientation: 'vertical' | 'horizontal';
  scale: number;
  safeTop: number;
  safeBottom: number;
  safeLeft: number;
  safeRight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  useCompactSnapshot: boolean;
  countdown: CountdownSummary;
  routeState: DerivedRouteState;
}

const COLORS = {
  midnightInk: '#0B0F17',
  midnightElevated: '#111723',
  midnightPanel: '#131A28',
  hairline: 'rgba(244, 240, 234, 0.12)',
  hairlineStrong: 'rgba(244, 240, 234, 0.24)',
  subtleGrid: 'rgba(244, 240, 234, 0.03)',
  warmIvory: '#F4F0EA',
  ivorySecondary: '#C6C0B4',
  ivoryMuted: '#8A8479',
  vividOrange: '#FF5A1F',
  vividOrangeSoft: 'rgba(255, 90, 31, 0.14)',
  completedTrack: '#9A9488',
};

/**
 * Pure calculation of layout geometry, orientation, safe zones, and countdown summary.
 * Testable in Node without a browser DOM.
 */
export function computeWallpaperLayoutMetrics(
  width: number,
  height: number,
  plan: DeadlockdPlan,
  todayStr: string
): WallpaperLayoutMetrics {
  const aspect = width / height;
  const orientation: 'vertical' | 'horizontal' =
    aspect >= 1.15 ? 'horizontal' : 'vertical';

  const shortSide = Math.min(width, height);
  const scale = shortSide / 1080;

  // Generous margins and default clearance for lock-screen clocks
  const basePadX = Math.round(width * (orientation === 'horizontal' ? 0.08 : 0.085));
  const baseTop = Math.round(
    height * (orientation === 'vertical' ? 0.195 : 0.15)
  );
  const baseBottom = Math.round(
    height * (orientation === 'vertical' ? 0.065 : 0.09)
  );

  // Apply user-controlled route offset (-100 to +100) while clamping inside safe canvas bounds
  const maxShiftY = Math.round(height * 0.14);
  const maxShiftX = Math.round(width * 0.06);
  const shiftY = Math.round((plan.routeOffsetY / 100) * maxShiftY);
  const shiftX = Math.round((plan.routeOffsetX / 100) * maxShiftX);

  const safeTop = Math.max(Math.round(height * 0.05), baseTop + shiftY);
  const safeBottom = Math.max(Math.round(height * 0.05), baseBottom - shiftY);
  const safeLeft = Math.max(Math.round(width * 0.04), basePadX + shiftX);
  const safeRight = Math.max(Math.round(width * 0.04), basePadX - shiftX);

  const contentX = safeLeft;
  const contentY = safeTop;
  const contentWidth = Math.max(240, width - safeLeft - safeRight);
  const contentHeight = Math.max(280, height - safeTop - safeBottom);

  const routeState = deriveRouteState(plan);
  const countdown = buildCountdownSummary(
    todayStr,
    plan.deadline,
    routeState.allComplete
  );

  // Only fall back to a single dated snapshot string on ultra-tiny custom canvases
  const useCompactSnapshot =
    countdown.strip.length <= 1 ||
    contentWidth < Math.round(320 * scale) ||
    shortSide < 420;

  return {
    width,
    height,
    orientation,
    scale,
    safeTop,
    safeBottom,
    safeLeft,
    safeRight,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    useCompactSnapshot,
    countdown,
    routeState,
  };
}

/**
 * Helper to wrap or truncate text within a maximum pixel width.
 */
function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const clean = text.trim() || 'Untitled deadline';
  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (!currentLine) {
        let sliced = word;
        while (
          sliced.length > 1 &&
          ctx.measureText(`${sliced}…`).width > maxWidth
        ) {
          sliced = sliced.slice(0, -1);
        }
        lines.push(`${sliced}…`);
      } else {
        lines.push(currentLine);
        currentLine = word;
      }

      if (lines.length === maxLines - 1) {
        const remaining = [currentLine, ...words.slice(i + 1)]
          .filter(Boolean)
          .join(' ');
        currentLine = truncateSingleLine(ctx, remaining, maxWidth);
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(truncateSingleLine(ctx, currentLine, maxWidth));
  }

  return lines.length > 0 ? lines : [clean];
}

function truncateSingleLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1).trimEnd();
  }
  return `${clipped}…`;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draws a station marker on the transit route:
 * - 'completed': filled warm ivory circle + midnight ink checkmark
 * - 'next': vivid orange double-ring marker (outer ring + solid inner core)
 * - 'upcoming': hollow circle marker with warm ivory stroke on midnight ink fill
 * - 'destination': terminal square-in-ring destination marker
 */
function drawStationMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  type: 'completed' | 'next' | 'upcoming' | 'destination',
  allComplete: boolean
) {
  ctx.save();

  if (type === 'completed') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.warmIvory;
    ctx.fill();

    ctx.beginPath();
    const s = radius * 0.48;
    ctx.moveTo(cx - s * 0.85, cy + s * 0.05);
    ctx.lineTo(cx - s * 0.15, cy + s * 0.75);
    ctx.lineTo(cx + s * 0.95, cy - s * 0.65);
    ctx.strokeStyle = COLORS.midnightInk;
    ctx.lineWidth = Math.max(2, radius * 0.28);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else if (type === 'next') {
    const haloR = radius * 1.95;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 90, 31, 0.16)';
    ctx.fill();

    const outerR = radius * 1.52;
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.midnightInk;
    ctx.fill();
    ctx.lineWidth = Math.max(3, radius * 0.32);
    ctx.strokeStyle = COLORS.vividOrange;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.76, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.vividOrange;
    ctx.fill();
  } else if (type === 'upcoming') {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.midnightInk;
    ctx.fill();
    ctx.lineWidth = Math.max(2.5, radius * 0.28);
    ctx.strokeStyle = COLORS.warmIvory;
    ctx.stroke();
  } else if (type === 'destination') {
    const termR = radius * 1.22;
    ctx.beginPath();
    ctx.arc(cx, cy, termR, 0, Math.PI * 2);
    ctx.fillStyle = allComplete ? COLORS.warmIvory : COLORS.midnightInk;
    ctx.fill();
    ctx.lineWidth = Math.max(2.5, radius * 0.28);
    ctx.strokeStyle = allComplete ? COLORS.warmIvory : COLORS.vividOrange;
    ctx.stroke();

    if (allComplete) {
      ctx.beginPath();
      const s = radius * 0.52;
      ctx.moveTo(cx - s * 0.85, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.15, cy + s * 0.75);
      ctx.lineTo(cx + s * 0.95, cy - s * 0.65);
      ctx.strokeStyle = COLORS.midnightInk;
      ctx.lineWidth = Math.max(2, radius * 0.28);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      const sq = radius * 0.86;
      ctx.fillStyle = COLORS.warmIvory;
      ctx.fillRect(cx - sq / 2, cy - sq / 2, sq, sq);
    }
  }

  ctx.restore();
}

/**
 * Renders the complete Deadlockd timetable wallpaper onto a 2D canvas.
 * Shared by both the live interactive preview and the exact-dimension PNG exporter.
 * Never draws undated relative strings ("14 days left", "in 1d") or OS preview clocks here.
 */
export function renderWallpaperToCanvas(
  canvas: HTMLCanvasElement,
  plan: DeadlockdPlan,
  todayStr: string,
  targetWidth: number,
  targetHeight: number
): WallpaperLayoutMetrics {
  if (canvas.width !== targetWidth) canvas.width = targetWidth;
  if (canvas.height !== targetHeight) canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  const metrics = computeWallpaperLayoutMetrics(
    targetWidth,
    targetHeight,
    plan,
    todayStr
  );
  if (!ctx) return metrics;

  const {
    width,
    height,
    orientation,
    scale,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    useCompactSnapshot,
    countdown,
    routeState,
  } = metrics;

  ctx.save();

  // 1. Background: Midnight Ink + subtle architectural timetable grid
  ctx.fillStyle = COLORS.midnightInk;
  ctx.fillRect(0, 0, width, height);

  const gridStep = Math.max(36, Math.round(72 * scale));
  ctx.strokeStyle = COLORS.subtleGrid;
  ctx.lineWidth = Math.max(1, Math.round(1 * scale));
  ctx.beginPath();
  for (let gx = gridStep; gx < width; gx += gridStep) {
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
  }
  for (let gy = gridStep; gy < height; gy += gridStep) {
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
  }
  ctx.stroke();

  const fontSans = `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
  const fontMono = `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;

  let cursorY = contentY;

  // =========================================================================
  // READING ORDER 1: GOAL · DEADLINE DATE + DATED 7-DAY COUNTDOWN STRIP
  // (No undated "14 days left" or "in 1d" phrases that go stale tomorrow)
  // =========================================================================

  const shortDeadline = formatShortDate(plan.deadline);
  const titleFontSize = Math.max(
    22,
    Math.round((orientation === 'horizontal' ? 52 : 50) * scale)
  );
  const dateSuffixFontSize = Math.max(
    18,
    Math.round((orientation === 'horizontal' ? 42 : 40) * scale)
  );

  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 ${titleFontSize}px ${fontSans}`;
  const goalLines = wrapTextLines(ctx, plan.goal, contentWidth, 2);
  const titleLineHeight = Math.round(titleFontSize * 1.18);

  // Measure whether " · Nov 25" fits on the final line of the goal title
  const lastGoalLine = goalLines[goalLines.length - 1];
  const lastGoalLineWidth = ctx.measureText(lastGoalLine).width;

  ctx.font = `600 ${dateSuffixFontSize}px ${fontMono}`;
  const dotStr = ' · ';
  const dotWidth = ctx.measureText(dotStr).width;
  const dateStrWidth = ctx.measureText(shortDeadline).width;
  const suffixFitsInline =
    lastGoalLineWidth + dotWidth + dateStrWidth <= contentWidth;

  for (let i = 0; i < goalLines.length; i++) {
    const lineBaselineY = cursorY + Math.round(titleFontSize * 0.88);
    ctx.font = `700 ${titleFontSize}px ${fontSans}`;
    ctx.fillStyle = COLORS.warmIvory;
    ctx.fillText(goalLines[i], contentX, lineBaselineY);

    if (i === goalLines.length - 1 && suffixFitsInline) {
      ctx.font = `700 ${dateSuffixFontSize}px ${fontMono}`;
      ctx.fillStyle = COLORS.vividOrange;
      ctx.fillText(dotStr, contentX + lastGoalLineWidth, lineBaselineY);

      ctx.font = `600 ${dateSuffixFontSize}px ${fontMono}`;
      ctx.fillStyle = COLORS.ivorySecondary;
      ctx.fillText(
        shortDeadline,
        contentX + lastGoalLineWidth + dotWidth,
        lineBaselineY
      );
    }
    cursorY += titleLineHeight;
  }

  if (!suffixFitsInline) {
    const subBaselineY = cursorY + Math.round(dateSuffixFontSize * 0.82);
    ctx.font = `700 ${dateSuffixFontSize}px ${fontMono}`;
    ctx.fillStyle = COLORS.vividOrange;
    ctx.fillText('Due · ', contentX, subBaselineY);
    const duePrefixW = ctx.measureText('Due · ').width;
    ctx.font = `600 ${dateSuffixFontSize}px ${fontMono}`;
    ctx.fillStyle = COLORS.ivorySecondary;
    ctx.fillText(shortDeadline, contentX + duePrefixW, subBaselineY);
    cursorY += Math.round(dateSuffixFontSize * 1.25);
  }

  ctx.textBaseline = 'top';
  cursorY += Math.round(14 * scale);

  // Top hairline divider separating header from dated strip
  ctx.strokeStyle = COLORS.hairlineStrong;
  ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
  ctx.beginPath();
  ctx.moveTo(contentX, cursorY);
  ctx.lineTo(contentX + contentWidth, cursorY);
  ctx.stroke();

  cursorY += Math.round(20 * scale);

  // 7-Day Dated Countdown Strip (with generous space to read at phone size)
  const bannerHeight = Math.round(62 * scale);

  if (countdown.status === 'complete') {
    drawRoundedRect(
      ctx,
      contentX,
      cursorY,
      contentWidth,
      bannerHeight,
      Math.round(10 * scale)
    );
    ctx.fillStyle = COLORS.midnightElevated;
    ctx.fill();
    ctx.strokeStyle = COLORS.hairlineStrong;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
    ctx.stroke();

    ctx.font = `600 ${Math.max(14, Math.round(26 * scale))}px ${fontMono}`;
    ctx.fillStyle = COLORS.warmIvory;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `Route complete  ·  ${formatFullDate(plan.deadline)}`,
      contentX + Math.round(20 * scale),
      cursorY + bannerHeight / 2
    );
    ctx.textBaseline = 'top';
    cursorY += bannerHeight + Math.round(38 * scale);
  } else if (
    countdown.status === 'due-today' ||
    countdown.status === 'overdue' ||
    useCompactSnapshot
  ) {
    drawRoundedRect(
      ctx,
      contentX,
      cursorY,
      contentWidth,
      bannerHeight,
      Math.round(10 * scale)
    );
    ctx.fillStyle = COLORS.midnightElevated;
    ctx.fill();
    ctx.strokeStyle =
      countdown.status === 'due-today' || countdown.status === 'overdue'
        ? COLORS.vividOrange
        : COLORS.hairlineStrong;
    ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
    ctx.stroke();

    ctx.font = `600 ${Math.max(14, Math.round(26 * scale))}px ${fontMono}`;
    ctx.fillStyle = COLORS.warmIvory;
    ctx.textBaseline = 'middle';
    const snapText =
      countdown.status === 'due-today'
        ? `Due today · ${shortDeadline}`
        : `${countdown.snapshotLabel} · Due ${shortDeadline}`;
    ctx.fillText(
      truncateSingleLine(ctx, snapText, contentWidth - Math.round(40 * scale)),
      contentX + Math.round(20 * scale),
      cursorY + bannerHeight / 2
    );
    ctx.textBaseline = 'top';
    cursorY += bannerHeight + Math.round(38 * scale);
  } else {
    // Active 7-day strip:
    // On portrait (vertical) when > 4 items exist, use 2 roomy rows (4 + 3) so each "Nov 11 · 14d" pill
    // has plenty of horizontal width and large 24px typography at phone size.
    const items = countdown.strip;
    const useTwoRows = orientation === 'vertical' && items.length > 4;
    const colsPerRow = useTwoRows ? Math.ceil(items.length / 2) : items.length;
    const rowCount = useTwoRows ? 2 : 1;

    const cellGapX = Math.round(10 * scale);
    const cellGapY = Math.round(10 * scale);
    const cellW = Math.floor(
      (contentWidth - cellGapX * (colsPerRow - 1)) / colsPerRow
    );
    const cellH = Math.round((useTwoRows ? 58 : 62) * scale);
    const pairFontSize = Math.max(12, Math.round((useTwoRows ? 24 : 23) * scale));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = useTwoRows ? Math.floor(i / colsPerRow) : 0;
      const col = useTwoRows ? i % colsPerRow : i;
      const cx = contentX + col * (cellW + cellGapX);
      const cy = cursorY + row * (cellH + cellGapY);
      const isToday = i === 0;

      drawRoundedRect(ctx, cx, cy, cellW, cellH, Math.round(9 * scale));
      ctx.fillStyle = isToday ? COLORS.vividOrangeSoft : COLORS.midnightElevated;
      ctx.fill();
      ctx.strokeStyle = isToday ? COLORS.vividOrange : COLORS.hairline;
      ctx.lineWidth = Math.max(1, Math.round((isToday ? 2 : 1.2) * scale));
      ctx.stroke();

      ctx.font = `${isToday ? '700' : '600'} ${pairFontSize}px ${fontMono}`;
      ctx.fillStyle = isToday ? COLORS.warmIvory : COLORS.ivorySecondary;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const singleLineText = item.pairText;
      if (ctx.measureText(singleLineText).width <= cellW - Math.round(14 * scale)) {
        ctx.fillText(singleLineText, cx + cellW / 2, cy + cellH / 2);
      } else {
        const fittedSize = Math.max(11, Math.round(19 * scale));
        ctx.font = `${isToday ? '700' : '600'} ${fittedSize}px ${fontMono}`;
        ctx.fillText(singleLineText, cx + cellW / 2, cy + cellH / 2);
      }
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const totalStripHeight = rowCount * cellH + (rowCount - 1) * cellGapY;
    cursorY += totalStripHeight + Math.round(38 * scale);
  }

  // =========================================================================
  // READING ORDER 2 & 3 MERGED: UNIFIED ROUTE WITH FOCAL "NEXT" STATION
  // =========================================================================

  interface RenderStop {
    label: string;
    dateStr: string;
    dateFormatted: string;
    markerType: 'completed' | 'next' | 'upcoming' | 'destination';
    isFocalNext: boolean;
  }

  const stops: RenderStop[] = routeState.stations.map((st) => ({
    label: st.label,
    dateStr: st.date,
    dateFormatted: formatShortDate(st.date),
    markerType: st.role,
    isFocalNext: st.role === 'next',
  }));

  const destinationIsFocalNext =
    !routeState.nextStation && !routeState.allComplete;

  stops.push({
    label: plan.goal,
    dateStr: plan.deadline,
    dateFormatted: formatShortDate(plan.deadline),
    markerType: destinationIsFocalNext ? 'next' : 'destination',
    isFocalNext: destinationIsFocalNext,
  });

  const remainingHeight = Math.max(
    Math.round(220 * scale),
    contentY + contentHeight - cursorY
  );

  if (orientation === 'vertical') {
    // VERTICAL TRANSIT TIMETABLE (Portrait & Square screens)
    const railX = contentX + Math.round(32 * scale);
    const stopCount = stops.length;

    const baseGap = Math.round(
      Math.min(168 * scale, remainingHeight / Math.max(3.5, stopCount + 0.35))
    );
    const nextExtraBefore = Math.round(28 * scale);
    const nextExtraAfter = Math.round(56 * scale);

    const stopYs: number[] = [];
    let yAcc = 0;
    for (let i = 0; i < stopCount; i++) {
      if (i > 0) {
        let gap = baseGap;
        if (stops[i].isFocalNext) gap += nextExtraBefore;
        if (stops[i - 1].isFocalNext) gap += nextExtraAfter;
        yAcc += gap;
      }
      stopYs.push(yAcc);
    }

    const totalRouteSpan = stopYs[stopYs.length - 1] || 0;
    const routeTopPadding = Math.max(
      Math.round(38 * scale),
      Math.min(
        Math.round(84 * scale),
        Math.round((remainingHeight - totalRouteSpan) * 0.28)
      )
    );
    const startY = cursorY + routeTopPadding;
    for (let i = 0; i < stopCount; i++) {
      stopYs[i] += startY;
    }

    // Draw vivid orange route line segments along the rail
    if (stopCount > 1) {
      for (let i = 0; i < stopCount - 1; i++) {
        const y1 = stopYs[i];
        const y2 = stopYs[i + 1];
        const segCompleted = stops[i].markerType === 'completed';

        ctx.beginPath();
        ctx.moveTo(railX, y1);
        ctx.lineTo(railX, y2);
        ctx.strokeStyle = segCompleted
          ? COLORS.completedTrack
          : COLORS.vividOrange;
        ctx.lineWidth = Math.max(3.5, Math.round(7.5 * scale));
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    const baseMarkerRadius = Math.max(8, Math.round(15 * scale));
    const focalMarkerRadius = Math.max(10, Math.round(18.5 * scale));
    const dateColWidth = Math.round(160 * scale);
    const labelStartX = railX + Math.round(50 * scale);
    const normalLabelMaxW = Math.max(
      140,
      contentWidth - (labelStartX - contentX) - dateColWidth - Math.round(16 * scale)
    );
    const focalLabelMaxW = Math.max(
      180,
      contentWidth - (labelStartX - contentX) - Math.round(24 * scale)
    );

    for (let i = 0; i < stopCount; i++) {
      const stop = stops[i];
      const sy = stopYs[i];
      const isNext = stop.isFocalNext;
      const isDest = i === stopCount - 1;
      const isDone = stop.markerType === 'completed';

      if (isNext) {
        const focalTitleSize = Math.max(22, Math.round(48 * scale));
        ctx.font = `700 ${focalTitleSize}px ${fontSans}`;
        const titleLines = wrapTextLines(ctx, stop.label, focalLabelMaxW, 2);
        const titleLineStep = Math.round(focalTitleSize * 1.15);
        const subLineSize = Math.max(14, Math.round(28 * scale));

        const blockHeight =
          titleLines.length * titleLineStep +
          Math.round(subLineSize * 1.45) +
          Math.round(36 * scale);
        const cardTopY = sy - Math.round(34 * scale);

        drawRoundedRect(
          ctx,
          contentX - Math.round(10 * scale),
          cardTopY,
          contentWidth + Math.round(20 * scale),
          blockHeight,
          Math.round(14 * scale)
        );
        ctx.fillStyle = COLORS.vividOrangeSoft;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 90, 31, 0.45)';
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.stroke();

        drawStationMarker(
          ctx,
          railX,
          sy,
          focalMarkerRadius,
          'next',
          routeState.allComplete
        );

        ctx.font = `700 ${focalTitleSize}px ${fontSans}`;
        ctx.fillStyle = COLORS.warmIvory;
        ctx.textBaseline = 'middle';
        for (let l = 0; l < titleLines.length; l++) {
          ctx.fillText(
            titleLines[l],
            labelStartX,
            sy + l * titleLineStep
          );
        }

        const nextLineY =
          sy +
          (titleLines.length - 1) * titleLineStep +
          Math.round(focalTitleSize * 0.82);
        ctx.font = `700 ${subLineSize}px ${fontMono}`;
        ctx.fillStyle = COLORS.vividOrange;
        const nextPrefix = 'Next';
        ctx.fillText(nextPrefix, labelStartX, nextLineY);

        const prefixW = ctx.measureText(nextPrefix).width;
        ctx.font = `600 ${subLineSize}px ${fontMono}`;
        ctx.fillStyle = COLORS.warmIvory;
        ctx.fillText(
          ` · ${stop.dateFormatted}`,
          labelStartX + prefixW,
          nextLineY
        );
      } else {
        drawStationMarker(
          ctx,
          railX,
          sy,
          baseMarkerRadius,
          stop.markerType,
          routeState.allComplete
        );

        const stationFontSize = Math.max(
          16,
          Math.round((isDest ? 34 : 32) * scale)
        );
        ctx.font = `${isDest ? '700' : '500'} ${stationFontSize}px ${fontSans}`;
        ctx.fillStyle = isDone
          ? COLORS.ivoryMuted
          : isDest
            ? COLORS.warmIvory
            : COLORS.ivorySecondary;
        ctx.textBaseline = 'middle';

        const truncatedLabel = truncateSingleLine(
          ctx,
          stop.label,
          normalLabelMaxW
        );
        ctx.fillText(truncatedLabel, labelStartX, sy);

        const dateFontSize = Math.max(14, Math.round(28 * scale));
        ctx.font = `${isDest ? '700' : '600'} ${dateFontSize}px ${fontMono}`;
        ctx.fillStyle = isDone
          ? COLORS.ivoryMuted
          : isDest
            ? COLORS.warmIvory
            : COLORS.ivorySecondary;
        ctx.textAlign = 'right';
        ctx.fillText(stop.dateFormatted, contentX + contentWidth, sy);
        ctx.textAlign = 'left';
      }
    }
  } else {
    // HORIZONTAL TRANSIT TIMETABLE (Laptop, Desktop, Wide Custom screens)
    const stopCount = stops.length;
    const padRailX = Math.round(Math.max(130 * scale, contentWidth * 0.11));
    const railLeft = contentX + padRailX;
    const railRight = contentX + contentWidth - padRailX;
    const railSpanX = Math.max(200, railRight - railLeft);
    const railY = cursorY + Math.round(remainingHeight * 0.46);
    const stepX = stopCount > 1 ? railSpanX / (stopCount - 1) : 0;

    if (stopCount > 1) {
      for (let i = 0; i < stopCount - 1; i++) {
        const x1 = railLeft + i * stepX;
        const x2 = railLeft + (i + 1) * stepX;
        const segCompleted = stops[i].markerType === 'completed';

        ctx.beginPath();
        ctx.moveTo(x1, railY);
        ctx.lineTo(x2, railY);
        ctx.strokeStyle = segCompleted
          ? COLORS.completedTrack
          : COLORS.vividOrange;
        ctx.lineWidth = Math.max(4, Math.round(8 * scale));
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    const baseMarkerRadius = Math.max(9, Math.round(16 * scale));
    const focalMarkerRadius = Math.max(12, Math.round(20 * scale));
    const useAlternating = stopCount >= 4;
    const maxStationLabelW = useAlternating
      ? Math.max(160, Math.min(stepX * 1.55, padRailX * 1.9))
      : Math.max(140, stepX * 0.88);

    for (let i = 0; i < stopCount; i++) {
      const stop = stops[i];
      const sx = railLeft + i * stepX;
      const isNext = stop.isFocalNext;
      const isDest = i === stopCount - 1;
      const isDone = stop.markerType === 'completed';

      const placeAbove = useAlternating ? i % 2 === 1 : false;
      const stemDir = placeAbove ? -1 : 1;
      const markerR = isNext ? focalMarkerRadius : baseMarkerRadius;

      const stemLen = Math.round((isNext ? 38 : 30) * scale);
      ctx.beginPath();
      ctx.moveTo(sx, railY + stemDir * (markerR + 6 * scale));
      ctx.lineTo(sx, railY + stemDir * (markerR + stemLen));
      ctx.strokeStyle = isNext ? COLORS.vividOrange : COLORS.hairlineStrong;
      ctx.lineWidth = Math.max(1.5, Math.round((isNext ? 2.8 : 2) * scale));
      ctx.stroke();

      drawStationMarker(
        ctx,
        sx,
        railY,
        markerR,
        stop.markerType,
        routeState.allComplete
      );

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const anchorX = sx;

      if (isNext) {
        const focalTitleSize = Math.max(18, Math.round(36 * scale));
        const focalDateSize = Math.max(13, Math.round(25 * scale));
        ctx.font = `700 ${focalTitleSize}px ${fontSans}`;
        const wrapped = wrapTextLines(
          ctx,
          stop.label,
          maxStationLabelW * 1.15,
          2
        );
        const lineStep = Math.round(focalTitleSize * 1.2);

        const baseLabelY =
          railY + stemDir * (markerR + stemLen + Math.round(28 * scale));

        const firstLineY = placeAbove
          ? baseLabelY -
            (wrapped.length - 1) * lineStep -
            Math.round(focalDateSize * 1.35)
          : baseLabelY;

        let widest = 0;
        for (const line of wrapped) {
          widest = Math.max(widest, ctx.measureText(line).width);
        }
        ctx.font = `700 ${focalDateSize}px ${fontMono}`;
        const nextDateText = `Next · ${stop.dateFormatted}`;
        widest = Math.max(widest, ctx.measureText(nextDateText).width);

        const cardW = widest + Math.round(44 * scale);
        const cardH =
          wrapped.length * lineStep +
          Math.round(focalDateSize * 1.45) +
          Math.round(32 * scale);
        const cardY = firstLineY - Math.round(focalTitleSize * 0.72);

        drawRoundedRect(
          ctx,
          anchorX - cardW / 2,
          cardY,
          cardW,
          cardH,
          Math.round(12 * scale)
        );
        ctx.fillStyle = COLORS.vividOrangeSoft;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 90, 31, 0.5)';
        ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
        ctx.stroke();

        ctx.font = `700 ${focalTitleSize}px ${fontSans}`;
        ctx.fillStyle = COLORS.warmIvory;
        for (let l = 0; l < wrapped.length; l++) {
          ctx.fillText(wrapped[l], anchorX, firstLineY + l * lineStep);
        }

        const subY =
          firstLineY +
          (wrapped.length - 1) * lineStep +
          Math.round(focalTitleSize * 0.85);
        ctx.font = `700 ${focalDateSize}px ${fontMono}`;
        const fullSub = `Next · ${stop.dateFormatted}`;
        const fullSubW = ctx.measureText(fullSub).width;
        const startSubX = anchorX - fullSubW / 2;

        ctx.textAlign = 'left';
        ctx.fillStyle = COLORS.vividOrange;
        ctx.fillText('Next', startSubX, subY);
        const nextW = ctx.measureText('Next').width;
        ctx.fillStyle = COLORS.warmIvory;
        ctx.fillText(` · ${stop.dateFormatted}`, startSubX + nextW, subY);
        ctx.textAlign = 'center';
      } else {
        const dateY = railY - stemDir * Math.round(36 * scale);
        const dateSize = Math.max(13, Math.round(25 * scale));
        ctx.font = `${isDest ? '700' : '600'} ${dateSize}px ${fontMono}`;
        ctx.fillStyle = isDone
          ? COLORS.ivoryMuted
          : isDest
            ? COLORS.warmIvory
            : COLORS.ivorySecondary;
        ctx.fillText(stop.dateFormatted, anchorX, dateY);

        const labelFontSize = Math.max(
          15,
          Math.round((isDest ? 29 : 27) * scale)
        );
        ctx.font = `${isDest ? '700' : '500'} ${labelFontSize}px ${fontSans}`;
        ctx.fillStyle = isDone
          ? COLORS.ivoryMuted
          : isDest
            ? COLORS.warmIvory
            : COLORS.ivorySecondary;

        const wrapped = wrapTextLines(ctx, stop.label, maxStationLabelW, 2);
        const lineStep = Math.round(labelFontSize * 1.24);
        const baseLabelY =
          railY + stemDir * (markerR + stemLen + Math.round(20 * scale));

        for (let l = 0; l < wrapped.length; l++) {
          const lineY = placeAbove
            ? baseLabelY - (wrapped.length - 1 - l) * lineStep
            : baseLabelY + l * lineStep;
          ctx.fillText(wrapped[l], anchorX, lineY);
        }
      }
    }
    ctx.textAlign = 'left';
  }

  ctx.restore();
  return metrics;
}

/**
 * Draws simulated OS lock-screen fit overlays on a SEPARATE preview canvas.
 * Uses the plan's preview date (`todayStr`) so the simulated clock date matches the countdown strip.
 * This is never called during PNG export.
 */
export function renderOsPreviewOverlay(
  overlayCanvas: HTMLCanvasElement,
  osPreview: OsPreviewId,
  targetWidth: number,
  targetHeight: number,
  todayStr?: string
): void {
  if (overlayCanvas.width !== targetWidth) overlayCanvas.width = targetWidth;
  if (overlayCanvas.height !== targetHeight) overlayCanvas.height = targetHeight;

  const ctx = overlayCanvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, targetWidth, targetHeight);
  if (osPreview === 'none') return;

  const shortSide = Math.min(targetWidth, targetHeight);
  const scale = shortSide / 1080;
  const fontSans = `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
  const clockDateLabel = todayStr
    ? formatWeekdayShortDate(todayStr)
    : 'Wed, Nov 11';

  ctx.save();
  ctx.strokeStyle = 'rgba(244, 240, 234, 0.18)';
  ctx.fillStyle = 'rgba(244, 240, 234, 0.55)';
  ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));

  if (osPreview === 'iphone') {
    const boxY = Math.round(targetHeight * 0.048);
    const boxH = Math.round(targetHeight * 0.13);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(28 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.68)';
    ctx.fillText(clockDateLabel, targetWidth / 2, boxY + boxH * 0.22);

    ctx.font = `700 ${Math.round(112 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.78)';
    ctx.fillText('09:41', targetWidth / 2, boxY + boxH * 0.68);

    // Subtle horizontal safe-zone guide line below clock
    const guideY = boxY + boxH + Math.round(12 * scale);
    ctx.beginPath();
    ctx.setLineDash([Math.round(6 * scale), Math.round(6 * scale)]);
    ctx.moveTo(Math.round(targetWidth * 0.085), guideY);
    ctx.lineTo(Math.round(targetWidth * 0.915), guideY);
    ctx.stroke();
    ctx.setLineDash([]);

    const homeW = Math.round(targetWidth * 0.34);
    const homeH = Math.round(9 * scale);
    ctx.fillStyle = 'rgba(244, 240, 234, 0.32)';
    drawRoundedRect(
      ctx,
      (targetWidth - homeW) / 2,
      targetHeight - Math.round(26 * scale),
      homeW,
      homeH,
      homeH / 2
    );
    ctx.fill();
  } else if (osPreview === 'android') {
    const boxX = Math.round(targetWidth * 0.085);
    const boxY = Math.round(targetHeight * 0.052);
    const boxH = Math.round(targetHeight * 0.125);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `700 ${Math.round(88 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.76)';
    ctx.fillText('09:41', boxX, boxY + Math.round(8 * scale));

    ctx.font = `500 ${Math.round(26 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.64)';
    ctx.fillText(
      `${clockDateLabel}  ·  72°F`,
      boxX + Math.round(4 * scale),
      boxY + Math.round(104 * scale)
    );

    const guideY = boxY + boxH + Math.round(14 * scale);
    ctx.beginPath();
    ctx.setLineDash([Math.round(6 * scale), Math.round(6 * scale)]);
    ctx.moveTo(Math.round(targetWidth * 0.085), guideY);
    ctx.lineTo(Math.round(targetWidth * 0.915), guideY);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (osPreview === 'macos') {
    const topBarH = Math.round(34 * scale);
    ctx.fillStyle = 'rgba(244, 240, 234, 0.06)';
    ctx.fillRect(0, 0, targetWidth, topBarH);

    const clockY = Math.round(targetHeight * 0.032);
    const clockH = Math.round(targetHeight * 0.11);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(24 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.65)';
    ctx.fillText(clockDateLabel, targetWidth / 2, clockY + clockH * 0.24);

    ctx.font = `700 ${Math.round(68 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.76)';
    ctx.fillText('09:41', targetWidth / 2, clockY + clockH * 0.70);

    const dockW = Math.round(targetWidth * 0.26);
    const dockH = Math.round(58 * scale);
    drawRoundedRect(
      ctx,
      (targetWidth - dockW) / 2,
      targetHeight - dockH - Math.round(16 * scale),
      dockW,
      dockH,
      Math.round(16 * scale)
    );
    ctx.stroke();
  } else if (osPreview === 'windows') {
    const clockY = Math.round(targetHeight * 0.032);
    const clockH = Math.round(targetHeight * 0.11);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(24 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.65)';
    ctx.fillText(clockDateLabel, targetWidth / 2, clockY + clockH * 0.24);

    ctx.font = `700 ${Math.round(68 * scale)}px ${fontSans}`;
    ctx.fillStyle = 'rgba(244, 240, 234, 0.76)';
    ctx.fillText('09:41', targetWidth / 2, clockY + clockH * 0.70);

    const taskH = Math.round(50 * scale);
    ctx.strokeRect(0, targetHeight - taskH, targetWidth, taskH);
  }

  ctx.restore();
}

/**
 * Renders the wallpaper onto an offscreen canvas at exact output pixel dimensions,
 * waits for document fonts to be ready, and triggers a browser PNG download.
 */
export async function exportWallpaperPng(
  plan: DeadlockdPlan,
  todayStr: string,
  width: number,
  height: number,
  filename: string
): Promise<{ width: number; height: number; filename: string; dataUrl: string }> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed even if font readiness promise rejects
    }
  }

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;

  renderWallpaperToCanvas(offscreen, plan, todayStr, width, height);

  const dataUrl = offscreen.toDataURL('image/png');

  const blob = await new Promise<Blob | null>((resolve) =>
    offscreen.toBlob((b) => resolve(b), 'image/png')
  );

  const downloadUrl = blob ? URL.createObjectURL(blob) : dataUrl;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  if (blob) {
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
  }

  return { width, height, filename, dataUrl };
}
