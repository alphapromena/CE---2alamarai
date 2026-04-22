import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, type = 'text', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-invalid={invalid || undefined}
      className={cn(
        // h-11 (44px) on mobile meets the iOS/Material touch-target minimum;
        // h-8 at md+ preserves the compact SaaS rhythm on desktop.
        'h-11 md:h-8 w-full rounded-md border border-border bg-white px-3 text-sm',
        'placeholder:text-fg-muted',
        'transition-colors duration-150',
        'focus:ring-accent/20 focus:border-accent focus:outline-none focus:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[invalid=true]:focus:ring-danger/20 data-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
});
