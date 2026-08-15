import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border-0 px-2 py-[3px] text-[11px] font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent-green-light)] text-[var(--success-text)]",
        secondary:
          "bg-[var(--accent-purple-light)] text-[var(--purple-text)] uppercase tracking-wider text-[10px]",
        destructive:
          "bg-[var(--accent-red-light)] text-[var(--danger-text)]",
        outline: "border border-[var(--border)] text-[var(--text-secondary)]",
        success: "bg-[var(--accent-green-light)] text-[var(--success-text)]",
        warning: "bg-[var(--accent-amber-light)] text-[var(--warning-text)]",
        danger: "bg-[var(--accent-red-light)] text-[var(--danger-text)]",
        info: "bg-[var(--accent-blue-light)] text-[var(--info-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
