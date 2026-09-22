import { useEffect, useRef } from 'react';
import { BrainCircuit, ChevronDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ThinkingPanelProps {
  /** What the turn is doing right now, e.g. "Searching the web". */
  label: string;
  /** Seconds spent so far, or spent thinking once the answer has landed. */
  seconds: number;
  streaming: boolean;
  /** Reasoning summaries as they arrive. Empty unless the model published any. */
  summary?: string;
  /** Whether the summaries were asked for at all. */
  summaryRequested?: boolean;
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Says what the assistant is doing while it does it.
 *
 * The stage line is always available — reasoning is invisible work, and an
 * unlabelled pause reads as a hang. The summary text underneath it only exists
 * when the model published one, because that costs extra latency.
 */
const ThinkingPanel = ({
  label,
  seconds,
  streaming,
  summary = '',
  summaryRequested = false,
  expanded,
  onToggle,
}: ThinkingPanelProps) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const trimmed = summary.trim();
  const hasSummary = trimmed.length > 0;

  // The newest reasoning appears at the bottom, so the block follows it the way
  // a transcript does instead of stranding the reader on the first line.
  useEffect(() => {
    if (!streaming || !expanded || !bodyRef.current) return;
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [streaming, expanded, trimmed]);

  // A tier that thought for under a second has nothing worth a line of its own.
  if (!streaming && !hasSummary && seconds < 1) return null;

  return (
    <div className="mb-2">
      {streaming ? (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" />
          <span className="truncate">{label}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground/70">
            {seconds}s
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={!hasSummary}
          className={cn(
            'flex items-center gap-1.5 text-xs text-muted-foreground',
            hasSummary && 'hover:text-foreground transition-colors'
          )}
        >
          <BrainCircuit className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>
            {hasSummary
              ? `Thought for ${seconds}s`
              : summaryRequested
                ? 'Model did not return a reasoning summary'
                : `Thought for ${seconds}s`}
          </span>
          {hasSummary && (
            <ChevronDown
              className={cn(
                'w-3.5 h-3.5 shrink-0 transition-transform duration-200',
                expanded && 'rotate-180'
              )}
            />
          )}
        </button>
      )}

      {expanded && hasSummary && (
        <div
          ref={bodyRef}
          className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
        >
          {trimmed}
        </div>
      )}
    </div>
  );
};

export default ThinkingPanel;
