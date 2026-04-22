import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold ' +
    'transition-[colors,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed ' +
    'motion-safe:active:scale-[0.98] motion-safe:active:duration-75 ' +
    'focus-visible:outline-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-white shadow-sm hover:bg-accent-hover active:bg-accent-active',
        secondary:
          'bg-white border border-border text-fg hover:bg-bg-hover',
        ghost: 'text-fg hover:bg-bg-hover',
        destructive: 'bg-danger text-white hover:opacity-90',
        icon: 'p-0 rounded-lg hover:bg-bg-hover',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        default: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-10 w-10',
      },
    },
    compoundVariants: [{ variant: 'icon', size: 'default', class: 'h-10 w-10' }],
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
