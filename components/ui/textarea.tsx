import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, rows = 4, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      data-invalid={invalid || undefined}
      className={cn(
        'block w-full rounded-md border border-border bg-white px-3 py-2 text-sm leading-5',
        'placeholder:text-fg-muted',
        'focus:ring-accent/20 focus:border-accent focus:outline-none focus:ring-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[invalid=true]:focus:ring-danger/20 data-[invalid=true]:border-danger',
        'resize-y',
        className,
      )}
      {...props}
    />
  );
});
