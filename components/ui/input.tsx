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
        'h-8 w-full rounded-md border border-border bg-white px-3 text-sm',
        'placeholder:text-fg-muted',
        'focus:ring-accent/20 focus:border-accent focus:outline-none focus:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[invalid=true]:focus:ring-danger/20 data-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
});
