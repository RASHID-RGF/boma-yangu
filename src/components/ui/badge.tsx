import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors duration-200',
  {
    variants: {
      variant: {
        default: 'bg-gray-100 text-gray-800',
        primary: 'bg-primary-100 text-primary-800',
        success: 'bg-emerald-100 text-emerald-800',
        warning: 'bg-amber-100 text-amber-800',
        danger: 'bg-red-100 text-red-800',
        info: 'bg-blue-100 text-blue-800',
        purple: 'bg-purple-100 text-purple-800',
        outline: 'border border-gray-200 text-gray-700 bg-transparent',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

// Status mapping helpers
export const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default' | 'primary' | 'purple'> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  OCCUPIED: 'info',
  VACANT: 'warning',
  PENDING: 'warning',
  OVERDUE: 'danger',
  EXPIRED: 'danger',
  TERMINATED: 'danger',
  CANCELLED: 'default',
  DRAFT: 'default',
  UNDER_MAINTENANCE: 'warning',
  REPORTED: 'info',
  IN_PROGRESS: 'primary',
  ASSIGNED: 'info',
  FAILED: 'danger',
  REFUNDED: 'purple',
  PARTIAL: 'warning',
  RESERVED: 'info',
  RENEWED: 'success',
  SENT: 'info',
};
