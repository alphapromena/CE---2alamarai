import { cn } from '@/lib/utils';

interface LiveIndicatorProps {
  label: string;
  /** 'pill' wraps in a bordered subtle pill; 'inline' renders just dot + label. */
  variant?: 'pill' | 'inline';
  className?: string;
}

/**
 * Pulsing cyan/teal dot + label. Use wherever a "Live" / "Realtime" badge is
 * shown. The ping animation is a core brand signal — keep it consistent.
 */
export function LiveIndicator({
  label,
  variant = 'pill',
  className,
}: LiveIndicatorProps) {
  const wrapperClasses =
    variant === 'pill'
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-accent-2-border bg-accent-2-subtle px-2.5 py-1.5 text-xs font-semibold text-accent-2-strong'
      : 'inline-flex items-center gap-1.5 text-xs font-semibold text-fg-secondary';

  return (
    <span className={cn(wrapperClasses, className)} role="status" aria-live="polite">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-2 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-2" />
      </span>
      {label}
    </span>
  );
}
