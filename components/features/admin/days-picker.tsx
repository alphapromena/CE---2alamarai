'use client';

import { cn } from '@/lib/utils';

export interface DaysPickerProps {
  /** Selected day numbers, Sun=0..Sat=6. */
  value: number[];
  onChange: (next: number[]) => void;
  /** Translated day-of-week short labels in Sun..Sat order. */
  labels: [string, string, string, string, string, string, string];
  disabled?: boolean;
}

const DAYS: ReadonlyArray<0 | 1 | 2 | 3 | 4 | 5 | 6> = [0, 1, 2, 3, 4, 5, 6];

export function DaysPicker({ value, onChange, labels, disabled }: DaysPickerProps) {
  function toggle(d: number) {
    if (disabled) return;
    onChange(
      value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort((a, b) => a - b),
    );
  }
  return (
    <div role="group" aria-label="Days of week" className="flex flex-wrap gap-1.5">
      {DAYS.map((d) => {
        const active = value.includes(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            disabled={disabled}
            aria-pressed={active}
            className={cn(
              'inline-flex h-8 min-w-[2.5rem] items-center justify-center rounded-md border px-2 text-xs font-medium',
              active
                ? 'border-accent bg-accent text-white'
                : 'border-border bg-white text-fg hover:bg-bg-hover',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            {labels[d]}
          </button>
        );
      })}
    </div>
  );
}
