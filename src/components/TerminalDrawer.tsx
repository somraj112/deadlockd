import React, { useState, useRef, useEffect } from 'react';
import {
  DeadlockdPlan,
  DerivedRouteState,
  DevicePresetId,
} from '../utils/planLogic';
import { parseCliCommand } from '../utils/cliParser';
import { addDaysToDateStr, formatShortDate } from '../utils/dateUtils';
import { Terminal, X, CornerDownLeft } from 'lucide-react';

export interface CliHistoryEntry {
  id: string;
  command: string;
  outputLines: string[];
  isError?: boolean;
}

interface TerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  plan: DeadlockdPlan;
  routeState: DerivedRouteState;
  todayStr: string;
  onMarkByIndex: (index: number, done: boolean) => { ok: boolean; message: string };
  onSelectDevicePreset: (preset: Exclude<DevicePresetId, 'custom'>) => void;
  onTriggerExport: () => Promise<string>;
  onTriggerAiDraft: (goal: string, due: string) => Promise<string>;
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  isOpen,
  onClose,
  plan,
  routeState,
  todayStr,
  onMarkByIndex,
  onSelectDevicePreset,
  onTriggerExport,
  onTriggerAiDraft,
}) => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<CliHistoryEntry[]>([
    {
      id: 'init-1',
      command: 'help',
      outputLines: [
        'Deadlockd CLI — Connected to live studio state.',
        '  help                              Show commands',
        '  plan                              List numbered stops',
        '  ai "My goal" --due YYYY-MM-DD     Suggest with Gemini',
        '  done 1                            Complete station #1',
        '  undo 1                            Reopen station #1',
        '  device phone|tall-phone|laptop|desktop',
        '  export                            Download PNG',
      ],
    },
  ]);
  const [cmdRecallHistory, setCmdRecallHistory] = useState<string[]>([]);
  const [recallIndex, setRecallIndex] = useState<number>(-1);
  const [isBusy, setIsBusy] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  const sampleAiDue = addDaysToDateStr(todayStr, 10);
  const tappableExamples = [
    'plan',
    'done 1',
    'undo 1',
    'device laptop',
    `ai "Launch portfolio site" --due ${sampleAiDue}`,
    'export',
    'help',
  ];

  const executeCommand = async (rawCmd: string) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    setCmdRecallHistory((prev) => [...prev, trimmed]);
    setRecallIndex(-1);
    setInput('');

    const parsed = parseCliCommand(trimmed);
    const entryId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    if (parsed.type === 'error') {
      setHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          outputLines: [
            `Error: ${parsed.message}`,
            ...(parsed.hint ? [parsed.hint] : []),
          ],
          isError: true,
        },
      ]);
      return;
    }

    if (parsed.type === 'help') {
      setHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          outputLines: [
            'Supported commands:',
            '  help',
            '  plan',
            '  ai "My goal" --due YYYY-MM-DD',
            '  done 1',
            '  undo 1',
            '  device phone|tall-phone|laptop|desktop',
            '  export',
          ],
        },
      ]);
      return;
    }

    if (parsed.type === 'plan') {
      const lines: string[] = [
        `GOAL: ${plan.goal} (Due ${plan.deadline})`,
        `NEXT: ${
          routeState.nextStation
            ? `#${routeState.nextStation.index} ${routeState.nextStation.label} (${formatShortDate(routeState.nextStation.date)})`
            : routeState.allComplete
              ? 'Route complete'
              : 'Final deadline'
        }`,
        'STATIONS:',
      ];
      if (routeState.stations.length === 0) {
        lines.push('  (No intermediate milestones yet)');
      } else {
        for (const st of routeState.stations) {
          const marker =
            st.role === 'completed'
              ? '[✓]'
              : st.role === 'next'
                ? '[◎ NEXT]'
                : '[ ]';
          lines.push(
            `  ${st.index}. ${marker} ${st.label} — ${st.date} (${formatShortDate(st.date)})`
          );
        }
      }
      setHistory((prev) => [
        ...prev,
        { id: entryId, command: trimmed, outputLines: lines },
      ]);
      return;
    }

    if (parsed.type === 'done') {
      const res = onMarkByIndex(parsed.index, true);
      setHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          outputLines: [res.message],
          isError: !res.ok,
        },
      ]);
      return;
    }

    if (parsed.type === 'undo') {
      const res = onMarkByIndex(parsed.index, false);
      setHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          outputLines: [res.message],
          isError: !res.ok,
        },
      ]);
      return;
    }

    if (parsed.type === 'device') {
      onSelectDevicePreset(parsed.preset);
      setHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          outputLines: [`Output preset switched to "${parsed.preset}".`],
        },
      ]);
      return;
    }

    if (parsed.type === 'export') {
      setIsBusy(true);
      try {
        const msg = await onTriggerExport();
        setHistory((prev) => [
          ...prev,
          { id: entryId, command: trimmed, outputLines: [msg] },
        ]);
      } finally {
        setIsBusy(false);
      }
      return;
    }

    if (parsed.type === 'ai') {
      setIsBusy(true);
      setHistory((prev) => [
        ...prev,
        {
          id: entryId,
          command: trimmed,
          outputLines: [
            `Requesting Gemini milestones for "${parsed.goal}" (--due ${parsed.due})…`,
          ],
        },
      ]);
      try {
        const msg = await onTriggerAiDraft(parsed.goal, parsed.due);
        setHistory((prev) =>
          prev.map((h) =>
            h.id === entryId ? { ...h, outputLines: [msg] } : h
          )
        );
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdRecallHistory.length === 0) return;
      const nextIdx =
        recallIndex === -1
          ? cmdRecallHistory.length - 1
          : Math.max(0, recallIndex - 1);
      setRecallIndex(nextIdx);
      setInput(cmdRecallHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (recallIndex === -1) return;
      const nextIdx = recallIndex + 1;
      if (nextIdx >= cmdRecallHistory.length) {
        setRecallIndex(-1);
        setInput('');
      } else {
        setRecallIndex(nextIdx);
        setInput(cmdRecallHistory[nextIdx]);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Deadlockd browser CLI terminal"
      className="fixed inset-x-0 bottom-0 z-40 max-h-[75vh] lg:static lg:max-h-none lg:w-[380px] xl:w-[420px] flex flex-col bg-[#0A0E16] border-t lg:border-t-0 lg:border-l border-[#F4F0EA]/15 rounded-t-2xl lg:rounded-none shadow-2xl"
    >
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#F4F0EA]/10">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#FF5A1F]" />
          <span className="text-xs font-mono font-semibold text-[#F4F0EA]">
            Terminal CLI
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close terminal"
          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#8A8479] hover:text-[#F4F0EA] hover:bg-[#F4F0EA]/10"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tappable Command Examples */}
      <div className="px-4 py-2.5 border-b border-[#F4F0EA]/10 bg-[#080B10]/60">
        <div className="text-[11px] text-[#8A8479] mb-1.5">
          Tap a command to run:
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tappableExamples.map((ex) => (
            <button
              key={ex}
              type="button"
              disabled={isBusy}
              onClick={() => executeCommand(ex)}
              className="min-h-[30px] px-2 py-1 rounded bg-[#111723] hover:bg-[#192233] border border-[#F4F0EA]/10 text-[11px] font-mono text-[#C6C0B4] hover:text-[#F4F0EA] transition-colors whitespace-nowrap shrink-0"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {/* Command Output Transcript */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs min-h-[200px] max-h-[38vh] lg:max-h-none"
      >
        {history.map((item) => (
          <div key={item.id} className="space-y-1">
            <div className="text-[#FF5A1F] font-semibold">
              $ {item.command}
            </div>
            <div
              className={`space-y-0.5 pl-2 border-l ${
                item.isError
                  ? 'border-[#FF5A1F] text-[#FF5A1F]'
                  : 'border-[#F4F0EA]/15 text-[#C6C0B4]'
              }`}
            >
              {item.outputLines.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-words leading-relaxed">
                  {line}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Command Prompt Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          executeCommand(input);
        }}
        className="p-3 border-t border-[#F4F0EA]/10 bg-[#080B10] flex items-center gap-2"
      >
        <span className="text-xs font-mono font-bold text-[#FF5A1F] pl-1">
          $
        </span>
        <input
          ref={inputRef}
          type="text"
          aria-label="CLI command input"
          disabled={isBusy}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Type a command (e.g. done 1, plan, help)…'
          className="flex-1 min-h-[40px] bg-transparent text-xs font-mono text-[#F4F0EA] placeholder-[#8A8479]/60 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isBusy}
          aria-label="Run CLI command"
          className="min-h-[40px] px-3 rounded-lg bg-[#111723] hover:bg-[#192233] border border-[#F4F0EA]/15 text-xs font-mono text-[#F4F0EA] inline-flex items-center gap-1"
        >
          Run
          <CornerDownLeft className="w-3 h-3" />
        </button>
      </form>
    </aside>
  );
};
