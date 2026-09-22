import { Brain } from 'lucide-react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ThinkingToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Header on mobile, composer on desktop — one control, one visible at a time. */
  variant?: 'header' | 'composer';
  /** Extra classes for the trigger, e.g. breakpoint visibility. */
  className?: string;
}

/**
 * Reveals the model's reasoning summaries while it answers.
 *
 * A single icon button: click once to enable thinking, click again to disable.
 * Opt-in because asking for a summary costs the model extra time — the wait is
 * already shown either way, this only decides whether its contents are.
 */
const ThinkingToggle = ({
  checked,
  onCheckedChange,
  variant = 'composer',
  className,
}: ThinkingToggleProps) => {
  const isHeader = variant === 'header';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onCheckedChange(!checked)}
          aria-pressed={checked}
          aria-label="Show the model's thinking"
          title="Show the model's thinking"
          className={cn(
            'flex items-center justify-center self-center rounded-full smooth-transition',
            // Header pill stands alone on the mobile page header; the composer
            // pill lives in the composer's footer row, so it stays compact.
            isHeader ? 'h-9 w-9 border-2' : 'h-8 w-8 border',
            // Light primary tint when thinking is ON (matching the model pill),
            // neutral color when OFF, so the two states stay easy to tell apart.
            checked
              ? 'border-primary/30 bg-primary/10 text-primary'
              : 'border-border-strong bg-transparent text-muted-foreground hover:border-primary/40 hover:text-foreground',
            className
          )}
        >
          <Brain
            className={cn(
              'shrink-0 transition-colors',
              isHeader ? 'h-[1.15em] w-[1.15em]' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        </button>
      </TooltipTrigger>
      <TooltipContent side={isHeader ? 'bottom' : 'top'}>
        Show the model&apos;s reasoning while it answers. Adds a little latency on
        models that think.
      </TooltipContent>
    </Tooltip>
  );
};

export default ThinkingToggle;
