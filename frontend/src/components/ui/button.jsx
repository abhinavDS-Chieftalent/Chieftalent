import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Text on the orange primary is ink (white on #EE5A2E fails AA). Hover/active increase contrast.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background-color,color,border-color,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer touch-manipulation",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[#db4f25]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-[#a52c24]",
        outline: "border border-input bg-card text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[#dfe2e6]",
        ghost: "text-foreground hover:bg-muted",
        link: "text-orange-deep underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-6 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})
Button.displayName = "Button"

export { Button, buttonVariants }
