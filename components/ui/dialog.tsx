'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Dialog — accessible modal built on the native <dialog> element.
 *
 * The native element provides focus trap, ESC-to-close, and inert-background
 * semantics out of the box. We layer the design-system styling on top and
 * surface a controlled API.
 *
 * Why not Radix Dialog: Phase 1 only ships @radix-ui/react-slot. Adding
 * @radix-ui/react-dialog is a fair-sized dep for one component when the
 * platform primitive does the same job.
 */
export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Footer content (typically the action buttons). */
  footer?: React.ReactNode;
  /** Translated close-button aria-label. */
  closeLabel: string;
  /** Optional aria-labelledby override; defaults to the title element id. */
  className?: string;
  /** Maximum width — defaults to a single-column form (max-w-md). */
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASS: Record<NonNullable<DialogProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel,
  className,
  size = 'md',
}: DialogProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Keep the <dialog> open/closed state in sync with the controlled prop.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // Native <dialog> dispatches a `cancel` event on ESC; map both `cancel` and
  // `close` to the controlled callback so consumers don't have to.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onOpenChange(false);
    el.addEventListener('cancel', handler);
    el.addEventListener('close', handler);
    return () => {
      el.removeEventListener('cancel', handler);
      el.removeEventListener('close', handler);
    };
  }, [onOpenChange]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      // Backdrop click closes — implemented by checking that the click target
      // is the dialog itself (not its inner content).
      onClick={(e) => {
        if (e.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        // Reset the browser default centring + spacing
        'fixed inset-0 m-auto bg-transparent p-0',
        // Backdrop — ink-tinted for brand cohesion, soft blur, fade in
        'backdrop:bg-ink/60 backdrop:backdrop-blur-sm',
        'motion-safe:backdrop:animate-fade-in',
        // Disable default outline; focus trap handles inner focus
        'focus:outline-none',
      )}
    >
      <div
        className={cn(
          'w-[calc(100vw-2rem)] rounded-2xl border border-border bg-white p-6 shadow-lg',
          'motion-safe:animate-scale-in',
          SIZE_CLASS[size],
          className,
        )}
        // Stop bubbled clicks from triggering the backdrop-close handler above
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-fg-secondary">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={() => onOpenChange(false)}
            className="-me-2 -mt-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-secondary hover:bg-bg-hover hover:text-fg"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div className="text-sm">{children}</div>

        {footer ? (
          <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
