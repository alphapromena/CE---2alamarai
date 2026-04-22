'use client';

import { useEffect, useState } from 'react';
import { Alert, type AlertProps } from './alert';

export interface AutoDismissAlertProps extends AlertProps {
  /** Dismiss timeout in ms. Defaults to 4000. */
  dismissMs?: number;
  /**
   * Key that resets the dismiss timer. Pass a value that changes with every
   * new alert (e.g. a UUID, or the submit timestamp) so back-to-back successes
   * don't skip the animation. Optional.
   */
  resetKey?: string | number;
}

/**
 * Client-only wrapper around Alert that auto-dismisses after `dismissMs`.
 * Use for inline success confirmations (e.g. "Saved") that should fade out.
 * Do NOT use for danger/error alerts — those must stay until the user
 * acknowledges or the cause changes.
 */
export function AutoDismissAlert({
  dismissMs = 4000,
  resetKey,
  variant = 'success',
  ...props
}: AutoDismissAlertProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), dismissMs);
    return () => window.clearTimeout(id);
  }, [dismissMs, resetKey]);

  if (!visible) return null;
  return <Alert variant={variant} {...props} />;
}
