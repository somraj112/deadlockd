import { isValidDateStr } from './dateUtils';
import { DevicePresetId } from './planLogic';

export type CliCommandAction =
  | { type: 'help' }
  | { type: 'plan' }
  | { type: 'ai'; goal: string; due: string }
  | { type: 'done'; index: number }
  | { type: 'undo'; index: number }
  | { type: 'device'; preset: Exclude<DevicePresetId, 'custom'> }
  | { type: 'export' }
  | { type: 'error'; message: string; hint?: string };

const ALLOWED_DEVICES = new Set<Exclude<DevicePresetId, 'custom'>>([
  'phone',
  'tall-phone',
  'laptop',
  'desktop',
]);

/**
 * Parses a single browser CLI command string into a typed action.
 * Supported application commands:
 * - help
 * - plan
 * - ai "My goal" --due YYYY-MM-DD
 * - done 1
 * - undo 1
 * - device phone|tall-phone|laptop|desktop
 * - export
 */
export function parseCliCommand(rawInput: string): CliCommandAction {
  const input = rawInput.trim();
  if (!input) {
    return {
      type: 'error',
      message: 'Enter a command.',
      hint: 'Type "help" to see all available commands.',
    };
  }

  const lower = input.toLowerCase();

  if (lower === 'help') {
    return { type: 'help' };
  }

  if (lower === 'plan') {
    return { type: 'plan' };
  }

  if (lower === 'export') {
    return { type: 'export' };
  }

  // Match `done <n>` or `undo <n>`
  if (lower.startsWith('done ') || lower === 'done') {
    const arg = input.slice(4).trim();
    const num = Number(arg);
    if (!arg || !Number.isInteger(num) || num < 1) {
      return {
        type: 'error',
        message: 'Usage: done <station-number>',
        hint: 'Example: done 1 (marks station #1 as completed). Run "plan" to list station numbers.',
      };
    }
    return { type: 'done', index: num };
  }

  if (lower.startsWith('undo ') || lower === 'undo') {
    const arg = input.slice(4).trim();
    const num = Number(arg);
    if (!arg || !Number.isInteger(num) || num < 1) {
      return {
        type: 'error',
        message: 'Usage: undo <station-number>',
        hint: 'Example: undo 1 (marks station #1 as unfinished). Run "plan" to list station numbers.',
      };
    }
    return { type: 'undo', index: num };
  }

  // Match `device phone|tall-phone|laptop|desktop`
  if (lower.startsWith('device ') || lower === 'device') {
    const arg = input.slice(6).trim().toLowerCase() as Exclude<
      DevicePresetId,
      'custom'
    >;
    if (!ALLOWED_DEVICES.has(arg)) {
      return {
        type: 'error',
        message: `Invalid device preset "${input.slice(6).trim() || ''}".`,
        hint: 'Usage: device phone | tall-phone | laptop | desktop',
      };
    }
    return { type: 'device', preset: arg };
  }

  // Match `ai "My goal" --due YYYY-MM-DD` (supports double quotes, single quotes, or unquoted text before --due)
  if (lower.startsWith('ai ') || lower === 'ai') {
    const rest = input.slice(2).trim();
    const dueMatch = /--due\s+(\S+)/i.exec(rest);
    if (!dueMatch) {
      return {
        type: 'error',
        message: 'Missing required --due YYYY-MM-DD flag.',
        hint: 'Usage: ai "My goal" --due 2026-11-25',
      };
    }

    const due = dueMatch[1].trim();
    if (!isValidDateStr(due)) {
      return {
        type: 'error',
        message: `Invalid calendar date "${due}". Expected YYYY-MM-DD.`,
        hint: 'Usage: ai "My goal" --due 2026-11-25',
      };
    }

    const goalPart = rest.slice(0, dueMatch.index).trim();
    let goal = goalPart;
    if (
      (goal.startsWith('"') && goal.endsWith('"')) ||
      (goal.startsWith("'") && goal.endsWith("'")) ||
      (goal.startsWith('“') && goal.endsWith('”'))
    ) {
      goal = goal.slice(1, -1).trim();
    }

    if (!goal) {
      return {
        type: 'error',
        message: 'Missing goal description.',
        hint: 'Usage: ai "My goal" --due 2026-11-25',
      };
    }

    return { type: 'ai', goal, due };
  }

  const firstToken = input.split(/\s+/)[0];
  return {
    type: 'error',
    message: `Unknown command "${firstToken}".`,
    hint: 'Supported commands: help, plan, ai "My goal" --due YYYY-MM-DD, done 1, undo 1, device phone|tall-phone|laptop|desktop, export',
  };
}
