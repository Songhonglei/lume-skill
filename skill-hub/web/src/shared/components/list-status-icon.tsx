import { Archive, BadgeCheck, Ban, CalendarX2, CheckCircle2, Clock, Infinity as InfinityIcon, Snowflake } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

const statusStyles = {
  active: { icon: CheckCircle2, tone: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' },
  pending: { icon: Clock, tone: 'bg-amber-500/10 text-amber-800 dark:text-amber-300' },
  disabled: { icon: Ban, tone: 'bg-destructive/10 text-destructive' },
  frozen: { icon: Snowflake, tone: 'bg-sky-500/10 text-sky-800 dark:text-sky-300' },
  archived: { icon: Archive, tone: 'bg-muted text-muted-foreground' },
  expired: { icon: CalendarX2, tone: 'bg-destructive/10 text-destructive' },
  permanent: { icon: InfinityIcon, tone: 'bg-muted text-muted-foreground' },
  used: { icon: BadgeCheck, tone: 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300' },
} as const

export function ListStatusIcon({ kind, label }: { kind: keyof typeof statusStyles; label: string }) {
  const { icon: Icon, tone } = statusStyles[kind]
  return (
    <span role="img" aria-label={label} title={label} className={cn('inline-grid size-7 shrink-0 place-items-center rounded-md align-middle', tone)}>
      <Icon className="size-4" aria-hidden="true" />
    </span>
  )
}
