import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

// Onglets : liste en pilule sur surface-1 (comme la navigation du site de référence), onglet actif
// sur surface-0 ; clavier (flèches, Origine, Fin) et ARIA fournis par Radix.
const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-pilule bg-surface-1 p-1", className)}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-pilule px-4 text-sm font-medium text-fg-2 transition-[background-color,color,box-shadow] duration-fast ease-lien hover:text-fg disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface-0 data-[state=active]:font-semibold data-[state=active]:text-fg data-[state=active]:shadow-card [@media(pointer:coarse)]:h-11",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-4", className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
