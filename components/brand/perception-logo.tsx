import Image from 'next/image';
import { useId } from 'react';

export type LogoVariant = 'mark' | 'full' | 'horizontal';
export type LogoSurface = 'light' | 'dark';

interface PerceptionLogoProps {
  variant?: LogoVariant;
  surface?: LogoSurface;
  className?: string;
  priority?: boolean;
}

export function PerceptionLogo({
  variant = 'horizontal',
  surface = 'light',
  className,
  priority,
}: PerceptionLogoProps) {
  if (variant === 'full') {
    return (
      <Image
        src="/brand/perception-logo.png"
        alt="Perception"
        width={400}
        height={400}
        priority={priority}
        className={className ?? 'h-24 w-auto'}
      />
    );
  }

  if (variant === 'mark') {
    return <PerceptionMark className={className ?? 'h-8 w-8'} />;
  }

  const textColor = surface === 'dark' ? 'text-white' : 'text-fg';
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ''}`}>
      <PerceptionMark className="h-7 w-7" />
      <span
        className={`font-bold tracking-wider text-sm leading-none ${textColor}`}
      >
        PERCEPTION
      </span>
    </span>
  );
}

function PerceptionMark({ className }: { className?: string }) {
  // Unique gradient IDs so multiple instances on a page don't collide.
  const gradientId = useId();
  const maskId = useId();
  return (
    <svg
      viewBox="0 0 40 40"
      role="img"
      aria-label="Perception"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0ABCD4" />
          <stop offset="100%" stopColor="#2DD9B4" />
        </linearGradient>
        <mask id={maskId}>
          <rect x="0" y="0" width="40" height="40" fill="black" />
          {/* Stylized "P": left stem + upper bowl. */}
          <rect x="10" y="8" width="5" height="24" rx="1" fill="white" />
          <path
            d="M15 8 h9 a7 7 0 0 1 0 14 h-9 z"
            fill="white"
          />
          {/* Inner cutout of the bowl to create the P's hole. */}
          <path
            d="M15 12 h8 a3 3 0 0 1 0 6 h-8 z"
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="40"
        height="40"
        rx="9"
        fill="#1B2A4A"
      />
      <rect
        x="0"
        y="0"
        width="40"
        height="40"
        rx="9"
        fill={`url(#${gradientId})`}
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
