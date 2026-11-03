import * as React from "react"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Status colours are semantic only (pass / warn / fail). "info" is neutral: one accent per product.
const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-accent text-accent-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-fail-bg text-fail",
        outline: "border-input text-foreground",
        info: "border-transparent bg-muted text-foreground",
        success: "border-transparent bg-pass-bg text-pass",
        warning: "border-transparent bg-warn-bg text-warn",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
