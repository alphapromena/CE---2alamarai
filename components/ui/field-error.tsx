import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function FieldError({
  id,
  message,
  className,
}: {
  id?: string;
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      className={cn(
        'mt-1 flex items-center gap-1 text-xs text-danger motion-safe:animate-fade-up',
        className,
      )}
      role="alert"
    >
      <AlertCircle className="h-3 w-3" strokeWidth={1.75} aria-hidden />
      <span>{message}</span>
    </p>
  );
}
