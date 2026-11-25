import * as React from 'react'
import { cn } from '@/lib/utils'

const field = 'w-full rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground disabled:opacity-60'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...p }, ref) => <input ref={ref} className={cn(field, 'h-10', className)} {...p} />,
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(field, 'min-h-[96px] py-2', className)} {...p} />,
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select ref={ref} className={cn(field, 'h-10 pr-8', className)} {...p}>{children}</select>
  ),
)
Select.displayName = 'Select'

export function Field({ label, error, hint, children, className }: {
  label: string; error?: string; hint?: string; children: React.ReactNode; className?: string
}) {
  const id = React.useId()
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id, 'aria-invalid': !!error }) : children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
