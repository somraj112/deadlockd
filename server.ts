import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SuggestedMilestoneItem {
  label: string;
  date: string;
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

function validateSuggestedMilestones(
  rawItems: unknown,
  todayStr: string,
  deadlineStr: string
): { valid: boolean; error?: string; milestones: SuggestedMilestoneItem[] } {
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

  const validated: SuggestedMilestoneItem[] = [];
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

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '1mb' }));

  app.post('/api/suggest-milestones', async (req, res) => {
    try {
      const { goal, deadline, today } = req.body as {
        goal?: string;
        deadline?: string;
        today?: string;
      };

      const cleanGoal = typeof goal === 'string' ? goal.trim() : '';
      const cleanDeadline = typeof deadline === 'string' ? deadline.trim() : '';
      const cleanToday = typeof today === 'string' ? today.trim() : '';

      if (!cleanGoal) {
        res.status(400).json({
          error: 'Enter a clear goal before requesting milestone suggestions.',
        });
        return;
      }

      if (!isValidDateStr(cleanDeadline) || !isValidDateStr(cleanToday)) {
        res.status(400).json({
          error:
            'Both today and the deadline must be valid YYYY-MM-DD calendar dates.',
        });
        return;
      }

      const daysSpan = diffCalendarDays(cleanToday, cleanDeadline);
      if (daysSpan < 0) {
        res.status(400).json({
          error:
            'The deadline is in the past. Choose today or a future date to generate milestones.',
        });
        return;
      }

      const targetCount =
        daysSpan === 0
          ? 2
          : daysSpan <= 2
            ? 2
            : daysSpan <= 5
              ? 3
              : daysSpan <= 10
                ? 4
                : 5;

      const ai = getGeminiClient();

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
            description:
              'Chronological list of up to 5 concrete milestones between today and the deadline.',
            items: {
              type: Type.OBJECT,
              properties: {
                label: {
                  type: Type.STRING,
                  description:
                    'Short, observable action label (28 characters or fewer, e.g. "Record a 90-sec demo").',
                },
                date: {
                  type: Type.STRING,
                  description:
                    'Calendar date in YYYY-MM-DD format between today and deadline.',
                },
              },
              required: ['label', 'date'],
            },
          },
        },
      });

      const rawText = (response.text ?? '[]').trim();
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        res.status(502).json({
          error:
            'Gemini returned an unreadable response. Your current plan is untouched—you can edit milestones manually.',
        });
        return;
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        res.status(502).json({
          error:
            'Gemini did not suggest any milestones. Your current plan is untouched—you can add milestones manually.',
        });
        return;
      }

      const normalized = parsed
        .slice(0, 5)
        .map((item: Record<string, unknown>, idx: number) => {
          const rawLabel =
            typeof item?.label === 'string'
              ? item.label.trim().slice(0, 28)
              : '';
          let rawDate =
            typeof item?.date === 'string' ? item.date.trim() : '';

          if (!isValidDateStr(rawDate)) {
            const offset = Math.min(
              daysSpan,
              Math.max(
                0,
                Math.round(((idx + 1) / (parsed.length + 1)) * daysSpan)
              )
            );
            rawDate = addDaysToDateStr(cleanToday, offset);
          } else {
            if (rawDate < cleanToday) rawDate = cleanToday;
            if (rawDate > cleanDeadline) rawDate = cleanDeadline;
          }

          return {
            label: rawLabel,
            date: rawDate,
          };
        })
        .filter((m) => m.label.length > 0);

      normalized.sort((a, b) => a.date.localeCompare(b.date));

      const check = validateSuggestedMilestones(
        normalized,
        cleanToday,
        cleanDeadline
      );
      if (!check.valid) {
        res.status(422).json({
          error:
            check.error ||
            'Suggested milestones failed date validation. You can add or edit steps manually.',
        });
        return;
      }

      res.json({ milestones: check.milestones });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Unable to reach Gemini right now.';
      const isQuota =
        msg.includes('429') || msg.toLowerCase().includes('resource_exhausted');
      const isKey =
        msg.includes('403') ||
        msg.includes('400') ||
        msg.includes('GEMINI_API_KEY') ||
        msg.toLowerCase().includes('api_key');

      const friendlyError = isQuota
        ? 'Gemini quota is currently exhausted. Your existing plan is preserved—continue editing milestones manually.'
        : isKey
          ? 'Gemini is unavailable until a valid GEMINI_API_KEY is configured in Settings > Secrets. Your existing plan is preserved and manual editing is ready.'
          : `Gemini suggestion unavailable (${msg}). Your existing plan is preserved—you can add milestones manually.`;

      res.status(503).json({ error: friendlyError });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deadlockd server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
