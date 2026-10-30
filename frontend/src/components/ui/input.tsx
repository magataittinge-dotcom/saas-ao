import * as React from "react"

import { cn } from "@/lib/utils"

// Champ : bord à 3:1 (--border-field), survol plus marqué, focus = bord et anneau de l'accent,
// erreur = aria-invalid, désactivé = fond de carte et texte grisé.
const champ =
  "w-full rounded-md border border-input bg-surface-0 px-3 text-base text-fg transition-[border-color,background-color] duration-base ease-lien placeholder:text-fg-3 hover:border-fg-3 focus-visible:border-accent-ring focus-visible:outline-accent-ring aria-[invalid=true]:border-danger aria-[invalid=true]:outline-danger disabled:cursor-not-allowed disabled:border-bord-2 disabled:bg-surface-1 disabled:text-fg-disabled md:text-sm"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          champ,
          "flex h-10 py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg [@media(pointer:coarse)]:h-11",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(champ, "min-h-[88px] py-2.5", className)} {...props} />
  )
)
Textarea.displayName = "Textarea"

export { Input, Textarea }
