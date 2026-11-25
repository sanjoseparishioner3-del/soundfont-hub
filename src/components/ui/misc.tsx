import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react'
import * as React from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'

/* ---------- Badge ---------- */
const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-muted text-foreground',
      primary: 'bg-accent text-accent-foreground',
      success: 'bg-success/10 text-success',
      warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      danger: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
})
export function Badge({ className, variant, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...p} />
}

/* ---------- Card / Skeleton ---------- */
export const Card = ({ className, ...p }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-lg border border-border bg-card', className)} {...p} />
)
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cn('skeleton', className)} />

/* ---------- Dialog ---------- */
export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export function DialogContent({ title, description, children, className }: {
  title: string; description?: string; children: React.ReactNode; className?: string
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-xl',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className={description ? 'mt-1 text-sm text-muted-foreground' : 'sr-only'}>
              {description ?? title}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close className="rounded-md p-1 hover:bg-muted" aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string
  confirmLabel?: string; destructive?: boolean; onConfirm: () => void | Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(); onOpenChange(false) } finally { setBusy(false) } }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Empty / Error states ---------- */
export function EmptyState({ title, description, action, icon }: {
  title: string; description?: string; action?: React.ReactNode; icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="size-8" />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertCircle className="size-7 text-destructive" />
      <p className="font-medium">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">{error instanceof Error ? error.message : 'Please try again.'}</p>
      {retry && <Button variant="outline" size="sm" onClick={retry}>Try again</Button>}
    </div>
  )
}

/* ---------- Pagination ---------- */
export function Pagination({ page, pageSize, total, onChange }: {
  page: number; pageSize: number; total: number; onChange: (p: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 pt-6">
      <Button variant="outline" size="iconSm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft /></Button>
      <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
      <Button variant="outline" size="iconSm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight /></Button>
    </nav>
  )
}

/* ---------- Switch ---------- */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border')}
    >
      <span className={cn('absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
    </button>
  )
}
