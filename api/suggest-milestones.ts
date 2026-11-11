import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI, Type } from '@google/genai';

interface SuggestedMilestoneItem {
  label: string;
  date: string;
}

interface VercelRequest extends IncomingMessage {
  body?: unknown;
  method?: string;
}

interface VercelResponse extends ServerResponse {
  status?: (code: number) => VercelResponse;
  json?: (data: unknown) => void;
}

function sendJson(res: VercelResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function isValidDateStr(dateStr: string): boolean {
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

function parseDateStrToUtcMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function addDaysToDateStr(dateStr: string, daysToAdd: number): string {
  const ms = parseDateStrToUtcMs(dateStr);
  const target = new Date(ms + daysToAdd * 86_400_000);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function diffCalendarDays(fromDateStr: string, toDateStr: string): number {
  const fromMs = parseDateStrToUtcMs(fromDateStr);
  const toMs = parseDateStrToUtcMs(toDateStr);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }

  try {
    const bodyObj = (
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    ) as {
      goal?: string;
      deadline?: string;
      today?: string;
    };

    const cleanGoal = typeof bodyObj.goal === 'string' ? bodyObj.goal.trim() : '';
    const cleanDeadline =
      typeof bodyObj.deadline === 'string' ? bodyObj.deadline.trim() : '';
    const cleanToday =
      typeof bodyObj.today === 'string' ? bodyObj.today.trim() : '';

    if (!cleanGoal) {
      sendJson(res, 400, {
        error: 'Enter a clear goal before requesting milestone suggestions.',
      });
      return;
    }

    if (!isValidDateStr(cleanDeadline) || !isValidDateStr(cleanToday)) {
      sendJson(res, 400, {
        error:
          'Both today and the deadline must be valid YYYY-MM-DD calendar dates.',
      });
      return;
    }

    const daysSpan = diffCalendarDays(cleanToday, cleanDeadline);
    if (daysSpan < 0) {
      sendJson(res, 400, {
        error:
          'The deadline is in the past. Choose today or a future date to generate milestones.',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      sendJson(res, 503, {
        error:
          'Gemini is unavailable until GEMINI_API_KEY is configured in environment variables. Your existing plan is preserved and manual editing is ready.',
      });
      return;
    }

    const targetCount =
      daysSpan <= 2 ? 2 : daysSpan <= 5 ? 3 : daysSpan <= 10 ? 4 : 5;

    const ai = new GoogleGenAI({ apiKey });
    const prompt = [
      `Goal: "${cleanGoal}"`,
      `Today's date: ${cleanToday}`,
      `Final deadline: ${cleanDeadline} (${daysSpan} calendar days from today)`,
      `Suggest ${targetCount} concrete, observable intermediate milestones working backward from ${cleanDeadline} and returned in chronological order from ${cleanToday} to ${cleanDeadline}.`,
      `Rules:`,
      `- Prefer observable, specific actions such as "Record a 90-sec demo" or "Draft 3 case studies" over vague stages like "Prepare" or "Research".`,
      `- Keep each label 28 characters or fewer.`,
      `- Every date must be a real YYYY-MM-DD calendar date strictly between ${cleanToday} and ${cleanDeadline} inclusive, in non-decreasing chronological order.`,
    ].join('\n');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction:
          'You are a pragmatic project planner for Deadlockd. You break a deadline into concrete, observable action milestones (max 28 chars per label) with real YYYY-MM-DD calendar dates between today and the deadline, working backward from the deadline and ordered chronologically.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              date: { type: Type.STRING },
            },
            required: ['label', 'date'],
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '[]').trim()) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      sendJson(res, 502, {
        error:
          'Gemini did not suggest any milestones. Your current plan is untouched—you can add milestones manually.',
      });
      return;
    }

    const normalized: SuggestedMilestoneItem[] = parsed
      .slice(0, 5)
      .map((item: Record<string, unknown>, idx: number) => {
        const rawLabel =
          typeof item?.label === 'string'
            ? item.label.trim().slice(0, 28)
            : '';
        let rawDate = typeof item?.date === 'string' ? item.date.trim() : '';

        if (!isValidDateStr(rawDate)) {
          const offset = Math.min(
            daysSpan,
            Math.max(0, Math.round(((idx + 1) / (parsed.length + 1)) * daysSpan))
          );
          rawDate = addDaysToDateStr(cleanToday, offset);
        } else {
          if (rawDate < cleanToday) rawDate = cleanToday;
          if (rawDate > cleanDeadline) rawDate = cleanDeadline;
        }

        return { label: rawLabel, date: rawDate };
      })
      .filter((m) => m.label.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    sendJson(res, 200, { milestones: normalized });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : 'Unable to reach Gemini right now.';
    sendJson(res, 503, {
      error: `Gemini suggestion unavailable (${msg}). Your existing plan is preserved—you can add milestones manually.`,
    });
  }
}
