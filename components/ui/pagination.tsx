import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Translated text for "Page N of M". Receives { current, total } substitutions. */
  pageOfLabel: string;
  previousLabel: string;
  nextLabel: string;
  /** Set to true under html[dir="rtl"] so the chevrons mirror correctly. */
  rtl?: boolean;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  pageOfLabel,
  previousLabel,
  nextLabel,
  rtl,
  className,
}: PaginationProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const canPrev = safePage > 1;
  const canNext = safePage < safeTotal;

  const PrevIcon = rtl ? ChevronRight : ChevronLeft;
  const NextIcon = rtl ? ChevronLeft : ChevronRight;

  return (
    <nav
      className={cn('flex items-center justify-between gap-2', className)}
      aria-label="Pagination"
    >
      <p className="text-xs tabular-nums text-fg-secondary">{pageOfLabel}</p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => canPrev && onPageChange(safePage - 1)}
          disabled={!canPrev}
          aria-label={previousLabel}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-2.5 text-sm',
            'hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <PrevIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <span className="hidden sm:inline">{previousLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => canNext && onPageChange(safePage + 1)}
          disabled={!canNext}
          aria-label={nextLabel}
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md border border-border bg-white px-2.5 text-sm',
            'hover:bg-bg-hover disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="hidden sm:inline">{nextLabel}</span>
          <NextIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </nav>
  );
}
