import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  invalid?: boolean;
  size?: 'sm' | 'default';
  placeholder?: string;
  options?: SelectOption[];
}

/**
 * Select — native <select> styled to match the design system.
 *
 * Native <select> handles ArrowUp/ArrowDown/Home/End/typeahead and platform
 * accessibility (screen readers, mobile native pickers) better than any custom
 * combobox we'd write here. We get the entire keyboard contract for free.
 *
 * For richer combobox UX (search, multi-select), introduce a separate
 * Combobox primitive later — don't overload this one.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, size = 'default', placeholder, options, children, ...props },
  ref,
) {
  return (
    <span className="relative inline-flex w-full items-center">
      <select
        ref={ref}
        data-invalid={invalid || undefined}
        className={cn(
          'w-full appearance-none rounded-md border border-border bg-white pe-8 ps-3 text-sm',
          // Bump mobile heights to meet 44px touch target; keep desktop tight.
          size === 'sm' ? 'h-9 md:h-7' : 'h-11 md:h-8',
          'transition-colors duration-150',
          'focus:ring-accent/20 focus:border-accent focus:outline-none focus:ring-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'data-[invalid=true]:focus:ring-danger/20 data-[invalid=true]:border-danger',
          className,
        )}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled hidden={!props.value && !props.defaultValue}>
            {placeholder}
          </option>
        ) : null}
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute end-2 h-4 w-4 text-fg-muted"
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
});
