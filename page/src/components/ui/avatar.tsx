import * as React from "react"
import { cn } from "@/lib/utils"

function Avatar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar"
      className={cn(
        "relative flex size-8 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900 text-zinc-200 items-center justify-center text-xs font-semibold select-none",
        className
      )}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center rounded-full bg-zinc-800/80 text-zinc-300 font-medium text-xs",
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback }
