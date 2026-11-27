import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
      <div className="flex max-w-full items-center justify-center gap-1.5">
        <Inbox className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{title}</p>
      </div>
      {description && (
        <p className="max-w-md text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {description}
        </p>
      )}
      {action}
    </div>
  )
}
