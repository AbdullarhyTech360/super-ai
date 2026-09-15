import { cn } from '@/lib/utils';

interface TitleUnderlineProps {
  className?: string;
}

const TitleUnderline = ({ className }: TitleUnderlineProps) => (
  <div
    aria-hidden
    className={cn(
      'relative mt-1.5 h-3 w-full overflow-hidden',
      '[clip-path:polygon(0%_0%,100%_0%,calc(100%_-_24px)_100%,0%_100%)]',
      'bg-[linear-gradient(90deg,hsl(220,91%,58%),hsl(260,85%,72%),hsl(220,91%,58%))]',
      'shadow-[0_0_18px_hsl(220,91%,65%,0.55)]',
      'animate-glow-pulse motion-reduce:animate-none',
      className,
    )}
  >
    <span className="absolute top-0 left-0 h-full w-1/3 animate-title-shimmer bg-gradient-to-r from-transparent via-white/80 to-transparent blur-sm motion-reduce:animate-none" />
  </div>
);

export default TitleUnderline;