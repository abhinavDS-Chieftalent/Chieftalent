import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

// Underline tabs: the active tab is marked by an orange rule, not a raised pill.
const TabsList = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex min-w-0 max-w-full items-end justify-start gap-1 overflow-x-auto border-b border-border text-muted-foreground [&::-webkit-scrollbar]:hidden",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-2 text-sm font-semibold transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent after:content-[''] data-[state=active]:after:bg-primary cursor-pointer",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-2", className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
