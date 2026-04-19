import * as React from 'react';
import { cn } from '@/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  function Label({ className, required, children, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn(
          'mb-1.5 block text-xs font-medium text-fg-secondary',
          className,
        )}
        {...props}
      >
        {children}
        {required ? (
          <span className="ms-0.5 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
    );
  },
);
