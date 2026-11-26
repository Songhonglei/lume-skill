export const DASHBOARD_PAGE_TITLE_CLASS_NAME = 'min-w-0 break-words text-2xl font-semibold leading-8 tracking-tight'

interface DashboardPageHeaderProps {
  title: string
  actions?: React.ReactNode
}

/**
 * Standard header used by dashboard sub-pages so navigation and page framing stay consistent.
 *
 * The "back to dashboard" link is intentionally omitted — the sidebar already provides
 * complete navigation and makes a dedicated back link redundant.
 */
export function DashboardPageHeader({ title, actions }: DashboardPageHeaderProps) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className={DASHBOARD_PAGE_TITLE_CLASS_NAME} style={{ color: 'hsl(var(--foreground))' }}>{title}</h1>
        </div>
        {actions}
      </div>
    </div>
  )
}
