'use client';

import { useEffect, useState } from 'react';
import { Alert, type AlertProps } from './alert';

export interface AutoDismissAlertProps extends AlertProps {
  /** Dismiss timeout in ms. Defaults to 4000. */
  dismissMs?: number;
}

/**
 * Client-only wrapper around Alert that auto-dismisses after `dismissMs`.
 * Use for inline success confirmations (e.g. "Saved") that should fade out.
 * Do NOT use for danger/error alerts — those must stay until the user
 * acknowledges or the cause changes.
 *
 * To re-trigger after the component has mounted (e.g. a second save without
 * remounting the form), pass a changing `key` prop from the parent —
 * React's key semantics force a remount which restarts the timer.
 */
export function AutoDismissAlert({
  dismissMs = 4000,
  variant = 'success',
  ...props
}: AutoDismissAlertProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setVisible(false), dismissMs);
    return () => window.clearTimeout(id);
  }, [dismissMs]);

  if (!visible) return null;
  return <Alert variant={variant} {...props} />;
}
