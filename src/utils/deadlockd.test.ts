import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysToDateStr,
  buildCountdownSummary,
  diffCalendarDays,
  formatShortDate,
  formatWeekdayShortDate,
  isValidDateStr,
} from './dateUtils';
import {
  buildExportFilename,
  createDefaultExamplePlan,
  deriveRouteState,
  validateCustomDimensions,
  validateSuggestedMilestones,
} from './planLogic';
import { parseCliCommand } from './cliParser';
import { computeWallpaperLayoutMetrics } from './wallpaperRenderer';

test('built-in example sets deadline 14 days ahead and 4 milestones at +1, +5, +10, +13 days', () => {
  const fixedNow = new Date('2026-11-07T10:00:00Z');
  const plan = createDefaultExamplePlan(fixedNow, 'UTC');

  assert.equal(plan.goal, 'My first portfolio review');
  assert.equal(plan.createdAtDate, '2026-11-07');
  assert.equal(plan.deadline, '2026-11-21');
  assert.equal(plan.isBuiltInExample, true);
  assert.equal(plan.milestones.length, 4);

  assert.deepEqual(
    plan.milestones.map((m) => ({ label: m.label, date: m.date, done: m.done })),
    [
      { label: 'Pick two projects', date: '2026-11-08', done: false },
      { label: 'Write case studies', date: '2026-11-12', done: false },
      { label: 'Rehearse my intro', date: '2026-11-17', done: false },
      { label: 'Pack portfolio', date: '2026-11-20', done: false },
    ]
  );
});

test('countdown summary builds 7-day strip for Nov 21 deadline starting Nov 7', () => {
  const summary = buildCountdownSummary('2026-11-07', '2026-11-21', false);

  assert.equal(summary.status, 'active');
  assert.equal(summary.daysRemaining, 14);
  assert.equal(summary.liveHeadline, '14 days left');
  assert.equal(summary.snapshotLabel, '14 days left on Nov 7');
  assert.equal(summary.strip.length, 7);
  assert.equal(summary.strip[0].pairText, 'Nov 7 · 14d');
  assert.equal(summary.strip[1].pairText, 'Nov 8 · 13d');
  assert.equal(summary.strip[6].pairText, 'Nov 13 · 8d');
  assert.equal(formatWeekdayShortDate('2026-11-11'), 'Wed, Nov 11');
});

test('countdown strip ends early when deadline is fewer than 7 days away', () => {
  const summary = buildCountdownSummary('2026-11-07', '2026-11-10', false);
  assert.equal(summary.daysRemaining, 3);
  assert.equal(summary.strip.length, 3);
  assert.deepEqual(
    summary.strip.map((s) => s.pairText),
    ['Nov 7 · 3d', 'Nov 8 · 2d', 'Nov 9 · 1d']
  );
});

test('countdown summary handles deadline day, overdue, and route complete states', () => {
  const dueToday = buildCountdownSummary('2026-11-07', '2026-11-07', false);
  assert.equal(dueToday.status, 'due-today');
  assert.equal(dueToday.liveHeadline, 'Due today');

  const overdue = buildCountdownSummary('2026-11-09', '2026-11-07', false);
  assert.equal(overdue.status, 'overdue');
  assert.equal(overdue.liveHeadline, '2 days overdue');
  assert.equal(overdue.snapshotLabel, '2 days overdue on Nov 9');

  const complete = buildCountdownSummary('2026-11-07', '2026-11-21', true);
  assert.equal(complete.status, 'complete');
  assert.equal(complete.liveHeadline, 'Route complete');
});

test('deriveRouteState marks earliest unfinished milestone as next and updates when marked done', () => {
  const plan = createDefaultExamplePlan(new Date('2026-11-07T10:00:00Z'), 'UTC');
  const initial = deriveRouteState(plan);

  assert.equal(initial.nextStation?.label, 'Pick two projects');
  assert.equal(initial.stations[0].role, 'next');
  assert.equal(initial.stations[1].role, 'upcoming');
  assert.equal(initial.allComplete, false);

  // Mark station 1 done
  plan.milestones[0].done = true;
  const afterFirst = deriveRouteState(plan);
  assert.equal(afterFirst.stations[0].role, 'completed');
  assert.equal(afterFirst.stations[1].role, 'next');
  assert.equal(afterFirst.nextStation?.label, 'Write case studies');

  // Mark all done
  for (const m of plan.milestones) m.done = true;
  const afterAll = deriveRouteState(plan);
  assert.equal(afterAll.allComplete, true);
  assert.equal(afterAll.nextStation, null);
});

test('validateSuggestedMilestones enforces real dates, chronological order, and deadline bounds', () => {
  const validResult = validateSuggestedMilestones(
    [
      { label: 'Draft wireframes', date: '2026-11-08' },
      { label: 'Record a 90-sec demo', date: '2026-11-12' },
    ],
    '2026-11-07',
    '2026-11-21'
  );
  assert.equal(validResult.valid, true);
  assert.equal(validResult.milestones.length, 2);

  // Reject impossible calendar date
  const badDate = validateSuggestedMilestones(
    [{ label: 'Impossible date', date: '2026-02-30' }],
    '2026-02-01',
    '2026-03-01'
  );
  assert.equal(badDate.valid, false);

  // Reject out-of-order dates
  const outOfOrder = validateSuggestedMilestones(
    [
      { label: 'Step B', date: '2026-11-15' },
      { label: 'Step A', date: '2026-11-10' },
    ],
    '2026-11-07',
    '2026-11-21'
  );
  assert.equal(outOfOrder.valid, false);

  // Reject date after deadline
  const pastDeadline = validateSuggestedMilestones(
    [{ label: 'Late step', date: '2026-11-25' }],
    '2026-11-07',
    '2026-11-21'
  );
  assert.equal(pastDeadline.valid, false);
});

test('CLI parser handles all 7 commands and rejects unsupported commands', () => {
  assert.deepEqual(parseCliCommand('help'), { type: 'help' });
  assert.deepEqual(parseCliCommand('plan'), { type: 'plan' });
  assert.deepEqual(parseCliCommand('export'), { type: 'export' });
  assert.deepEqual(parseCliCommand('done 1'), { type: 'done', index: 1 });
  assert.deepEqual(parseCliCommand('undo 2'), { type: 'undo', index: 2 });
  assert.deepEqual(parseCliCommand('device laptop'), {
    type: 'device',
    preset: 'laptop',
  });
  assert.deepEqual(
    parseCliCommand('ai "Ship beta release" --due 2026-11-25'),
    {
      type: 'ai',
      goal: 'Ship beta release',
      due: '2026-11-25',
    }
  );

  const invalidCmd = parseCliCommand('delete 1');
  assert.equal(invalidCmd.type, 'error');
});

test('export filename and layout orientation adapt to device presets', () => {
  const plan = createDefaultExamplePlan(new Date('2026-11-07T10:00:00Z'), 'UTC');
  assert.equal(
    buildExportFilename(plan.goal, 'phone'),
    'deadlockd-portfolio-review-phone.png'
  );

  const phoneMetrics = computeWallpaperLayoutMetrics(
    1080,
    1920,
    plan,
    '2026-11-07'
  );
  assert.equal(phoneMetrics.orientation, 'vertical');

  const laptopMetrics = computeWallpaperLayoutMetrics(
    2560,
    1600,
    plan,
    '2026-11-07'
  );
  assert.equal(laptopMetrics.orientation, 'horizontal');

  const budgetCheck = validateCustomDimensions(8000, 8000);
  assert.equal(budgetCheck.valid, false);
});
