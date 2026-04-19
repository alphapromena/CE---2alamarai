import * as React from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DatePickerProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> {
  /** ISO date string (YYYY-MM-DD), or empty string. */
  value?: string;
  defaultValue?: string;
  /** Fires with an ISO date string (YYYY-MM-DD) or '' when cleared. */
  onChange?: (isoDate: string) => void;
  invalid?: boolean;
}

/**
 * DatePicker — wraps native <input type="date"> with our design tokens.
 *
 * Why native: the browser-supplied date picker is fully keyboard-accessible
 * (arrow grid navigation, Page/Home/End), uses the system locale for weekday
 * names, mirrors correctly under dir="rtl" automatically, and on mobile it
 * surfaces the native wheel/calendar UI which is the most familiar input to
 * users on Android/iOS. Building a custom calendar grid would lose all of
 * that and add a non-trivial accessibility surface.
 *
 * Accepts and emits ISO strings (YYYY-MM-DD), the format <input type="date">
 * uses on the wire regardless of display locale.
 */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { className, value, defaultValue, onChange, invalid, ...props },
  ref,
) {
  return (
    <span className="relative inline-flex w-full items-center">
      <input
        ref={ref}
        type="date"
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange?.(e.target.value)}
        data-invalid={invalid || undefined}
        className={cn(
          'h-8 w-full rounded-md border border-border bg-white pe-8 ps-3 text-sm',
          'placeholder:text-fg-muted',
          'focus:ring-accent/20 focus:border-accent focus:outline-none focus:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[invalid=true]:focus:ring-danger/20 data-[invalid=true]:border-danger',
          // Hide the native calendar icon — we render our own for consistent styling
          '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
          className,
        )}
        {...props}
      />
      <Calendar
        className="pointer-events-none absolute end-2 h-4 w-4 text-fg-muted"
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
});
