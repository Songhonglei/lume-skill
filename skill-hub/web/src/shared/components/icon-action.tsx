import { forwardRef } from 'react'
import { Button, type ButtonProps } from '@/shared/ui/button'
import { cn } from '@/shared/lib/utils'

export const IconAction = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(
  ({ label, children, className, variant = 'outline', ...props }, ref) => (
    <span className="group/action relative inline-flex shrink-0">
      <Button {...props} ref={ref} type="button" size="icon" variant={variant}
        className={cn('min-h-9 min-w-9', className)} aria-label={label}>
        {children}
      </Button>
      <span aria-hidden="true" className="invisible pointer-events-none absolute right-0 top-full z-20 mt-1 w-max max-w-44 rounded-md bg-foreground px-2 py-1 text-center text-xs text-background shadow-sm group-hover/action:visible group-focus-within/action:visible">
        {label}
      </span>
    </span>
  ),
)
IconAction.displayName = 'IconAction'
