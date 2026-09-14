import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useOverlayStack, useFocusTrap, useAutoFocus, useIsMobile } from '../lib/hooks'
import { colorOf } from '../lib/theme'
import { subjectIcon } from '../lib/subjectIcon'
import { cardClick, cx } from '../lib/ui'
import { ToastCtx, type Toast, type ToastApi } from '../lib/toast'
import type { Course } from '../lib/types'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet'
type Size = 'xs' | 'sm' | 'md' | 'lg'

const TONE: Record<Variant, string> = {
  primary: 'ui-tone-primary',
  secondary: 'ui-tone-secondary',
  ghost: 'ui-tone-ghost',
  quiet: 'ui-tone-quiet',
  danger: 'ui-tone-danger',
}

const BTN_SIZE: Record<Size, string> = {
  xs: 'ui-btn-xs',
  sm: 'ui-btn-sm',
  md: 'ui-btn-md',
  lg: 'ui-btn-lg',
}

const ICON_SIZE: Record<Size, string> = {
  xs: 'ui-iconbtn-xs',
  sm: 'ui-iconbtn-sm',
  md: 'ui-iconbtn-md',
  lg: 'ui-iconbtn-lg',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  full,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; full?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={cx('ui-btn', TONE[variant], BTN_SIZE[size], full && 'w-full', className)}
    />
  )
}

export function IconButton({
  label,
  className,
  size = 'md',
  variant = 'ghost',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: Size; variant?: Variant }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx('ui-iconbtn', TONE[variant], ICON_SIZE[size], className)}
    />
  )
}

export function Card({
  className,
  as: As = 'div',
  onOpen,
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType; onOpen?: () => void }) {
  const { onClick, onKeyDown, ...props } = rest
  return (
    <As
      {...props}
      onClick={onOpen ? cardClick(onOpen) : onClick}
      onKeyDown={
        onOpen
          ? (e: React.KeyboardEvent<HTMLElement>) => {
              onKeyDown?.(e)
              if (e.defaultPrevented || e.target !== e.currentTarget) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen()
              }
            }
          : onKeyDown
      }
      role={onOpen ? 'button' : props.role}
      tabIndex={onOpen ? 0 : props.tabIndex}
      className={cx('ui-card', onOpen && 'cursor-pointer', className)}
    />
  )
}

export function SectionTitle({
  children,
  right,
  className,
}: {
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('ui-section-title', className)}>
      <h2 className="ui-eyebrow ui-eyebrow-lg">{children}</h2>
      {right}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cx('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="text-[22px] sm:text-[27px] font-semibold tracking-[-0.02em] text-ink leading-tight truncate">
          {title}
        </h1>
        {description && <p className="mt-0.5 text-[12px] sm:text-[12.5px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-1.5 shrink-0">{actions}</div>}
    </header>
  )
}

export function PeriodNavigator({
  title,
  detail,
  onPrevious,
  onNext,
  onToday,
  nextDisabled = false,
  className,
}: {
  title: ReactNode
  detail?: ReactNode
  onPrevious: () => void
  onNext: () => void
  onToday?: () => void
  nextDisabled?: boolean
  className?: string
}) {
  return (
    <div className={cx('flex items-center gap-1', className)}>
      <IconButton label="Previous week" size="sm" onClick={onPrevious}>
        <ChevronLeft size={16} />
      </IconButton>
      <div className="min-w-0 px-1 text-center">
        <p className="text-[13px] font-medium text-ink tnum leading-tight truncate">{title}</p>
        {detail && <p className="mt-0.5 text-[11.5px] text-ink-3 tnum leading-tight truncate">{detail}</p>}
      </div>
      <IconButton label="Next week" size="sm" onClick={onNext} disabled={nextDisabled}>
        <ChevronRight size={16} />
      </IconButton>
      {onToday && <Button size="sm" onClick={onToday}>Today</Button>}
    </div>
  )
}

export function Panel({
  className,
  as: As = 'div',
  ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return <As {...rest} className={cx('ui-panel', className)} />
}

type ChipTone = 'neutral' | 'good' | 'warn' | 'critical' | 'quiet'

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'ui-chip-neutral',
  quiet: 'ui-chip-quiet',
  good: 'ui-chip-good',
  warn: 'ui-chip-warn',
  critical: 'ui-chip-critical',
}

export function Chip({
  children,
  tone = 'neutral',
  className,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span {...rest} className={cx('ui-chip', CHIP_TONE[tone], className)}>
      {children}
    </span>
  )
}

export function CourseDot({
  course,
  className,
  size = 15,
  style,
}: {
  course?: Course | null
  className?: string
  size?: number
  style?: React.CSSProperties
}) {
  if (!course) return null
  const resolvedSize = Math.max(12, size)
  return createElement(subjectIcon(course.code), {
    'aria-hidden': true,
    size: resolvedSize,
    className: cx('shrink-0', className),
    style: { color: colorOf(course), ...style },
  })
}

export function InlineEdit({
  value,
  onCommit,
  ariaLabel,
  className,
  children,
  disableFocusRing = false,
}: {
  value: string
  onCommit: (next: string) => void
  ariaLabel: string
  className?: string
  children?: ReactNode
  disableFocusRing?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  useEffect(() => {
    if (draft === null && returnFocus.current) {
      returnFocus.current = false
      trigger.current?.focus()
    }
  }, [draft])

  if (draft !== null) {
    const close = (byKey: boolean) => {
      returnFocus.current = byKey
      setDraft(null)
    }
    const commit = (byKey: boolean) => {
      const next = draft.trim()
      if (next && next !== value) onCommit(next)
      close(byKey)
    }
    return (
      <input
        value={draft}
        autoFocus
        aria-label={ariaLabel}
        data-escape-guard
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(true)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            close(true)
          }
        }}
        className={cx(
          'bg-transparent outline-none rounded-none border-b border-ink-3 -mb-px',
          disableFocusRing && 'focus-visible:outline-none',
          className,
        )}
      />
    )
  }

  return (
    <button
      ref={trigger}
      type="button"
      onClick={() => setDraft(value)}
      title="Click to edit"
      className={cx('text-left hover:text-ink transition-colors', disableFocusRing && 'focus-visible:outline-none', className)}
    >
      {children ?? value}
    </button>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cx('ui-field ui-input', className)} />
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx('ui-field ui-textarea', className)} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cx('ui-field ui-select', className)}>
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-3"
      >
        <path d="M4 6.5 8 10.5 12 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
  className,
  group,
}: {
  label: string
  hint?: ReactNode
  children: ReactNode
  className?: string
  group?: boolean
}) {
  const id = useId()
  const inner = (
    <>
      <span id={group ? id : undefined} className="text-[12.5px] font-medium text-ink-2">
        {label}
      </span>
      {children}
      {hint && <span className="text-[12px] text-ink-3 leading-snug">{hint}</span>}
    </>
  )
  const cls = cx('ui-field-stack', className)
  return group ? (
    <div role="group" aria-labelledby={id} className={cls}>
      {inner}
    </div>
  ) : (
    <label className={cls}>{inner}</label>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; title?: string }[]
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cx('ui-segmented', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'relative rounded-[8px] font-medium transition-all duration-150 whitespace-nowrap',
              size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-8 px-3 text-[13px]',
              active
                ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.08)]'
                : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  id,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void

  label: string
  id?: string

  disabled?: boolean
}) {
  const auto = useId()
  return (
    <button
      id={id ?? auto}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-[26px] w-[44px] rounded-full transition-colors duration-200 shrink-0',

        'before:absolute before:-inset-2 before:content-[""]',
        checked ? 'bg-invert-bg' : 'bg-line-2',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <span
        className={cx(
          'absolute top-[3px] left-[3px] h-5 w-5 rounded-full bg-surface shadow-sm',
          'transition-transform duration-200 ease-[var(--ease-out-soft)]',
          checked ? 'translate-x-[18px]' : 'translate-x-0',
        )}
      />
    </button>
  )
}

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const zIndex = useOverlayStack(open, onClose)
  const trapRef = useFocusTrap<HTMLDivElement>(open)
  const focusRef = useAutoFocus<HTMLDivElement>(open)
  const isMobile = useIsMobile()
  const titleId = useId()
  if (!open) return null

  const width = size === 'sm' ? 'sm:max-w-[420px]' : size === 'lg' ? 'sm:max-w-[720px]' : 'sm:max-w-[560px]'

  return createPortal(
    <div
      style={{ zIndex }}
      className="fixed inset-0 flex sm:items-center sm:justify-center items-end"
    >
      <div
        className="absolute inset-0 bg-[var(--c-overlay)] a-fade"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={(n) => {
          trapRef.current = n
          focusRef.current = n
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'relative w-full bg-surface shadow-pop border border-line flex flex-col',
          'max-h-[92vh] sm:max-h-[86vh]',
          'rounded-t-2xl sm:rounded-2xl',
          width,
          isMobile ? 'a-sheet' : 'a-pop',
        )}
      >
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-line shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-[16px] font-semibold leading-tight text-ink">{title}</h2>
            {description && <p className="text-[13px] text-ink-2 mt-0.5 leading-snug">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm" className="-mr-1.5 -mt-0.5">
            <X size={16} />
          </IconButton>
        </div>
        <div className="overflow-y-auto scroll-slim px-5 py-4 flex-1">{children}</div>
        {footer && (
          <div
            className={cx(
              'px-5 pt-4 border-t border-line bg-surface-2 rounded-b-2xl shrink-0',

              'pb-[calc(1rem+env(safe-area-inset-bottom,0px))]',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = 'Delete',
  destructive = true,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body?: ReactNode
  confirmLabel?: string
  destructive?: boolean
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex gap-2 justify-end">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm()
              onClose()
            }}
            data-autofocus
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p className="text-[14px] text-ink-2 leading-relaxed">{body}</p>
    </Sheet>
  )
}

let toastSeq = 0

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const timers = useRef(new Map<number, number>())

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id))
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
  }, [])

  const toast = useCallback<ToastApi['toast']>(
    (message, opts = {}) => {
      const id = ++toastSeq
      setItems((xs) => [...xs.slice(-2), { id, message, ...opts }])
      const ms = opts.duration ?? (opts.action ? 6500 : 3200)
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms))
    },
    [dismiss],
  )

  useEffect(() => {
    const map = timers.current
    return () => map.forEach((t) => clearTimeout(t))
  }, [])

  useEffect(() => {
    const handleExternalToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; opts?: Omit<Toast, 'id' | 'message'> }>).detail
      if (detail?.message) toast(detail.message, detail.opts)
    }
    window.addEventListener('nudge:toast', handleExternalToast)
    return () => window.removeEventListener('nudge:toast', handleExternalToast)
  }, [toast])

  const api = useMemo(() => ({ toast }), [toast])

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="fixed z-[9999] left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+76px)] sm:bottom-6 flex flex-col gap-2 items-center w-[calc(100vw-24px)] max-w-[420px] pointer-events-none"
          role="status"
          aria-live="polite"
        >
          {items.map((t) => (
            <div
              key={t.id}
              className={cx(
                'a-toast pointer-events-auto w-full flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-xl shadow-pop',
                'bg-invert-bg text-invert-ink text-[13.5px] font-medium',
              )}
            >
              <span className="flex-1 min-w-0 leading-snug">{t.message}</span>
              {t.secondaryAction && (
                <button
                  type="button"
                  onClick={() => {
                    t.secondaryAction!.run()
                    dismiss(t.id)
                  }}
                  className="shrink-0 h-8 px-3 rounded-lg font-semibold text-invert-ink/75 hover:text-invert-ink hover:bg-[rgba(128,128,128,.2)] transition-colors"
                >
                  {t.secondaryAction.label}
                </button>
              )}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action!.run()
                    dismiss(t.id)
                  }}
                  className="shrink-0 h-8 px-3 rounded-lg font-semibold bg-[rgba(128,128,128,.28)] hover:bg-[rgba(128,128,128,.42)] transition-colors"
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="shrink-0 h-8 w-8 grid place-items-center rounded-lg opacity-60 hover:opacity-100 transition-opacity"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('ui-empty', className)}>
      {icon && (
        <div className="h-11 w-11 rounded-xl bg-tint grid place-items-center text-ink-3 mb-3.5">{icon}</div>
      )}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {body && <p className="text-[13.5px] text-ink-2 mt-1.5 max-w-[42ch] leading-relaxed">{body}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2 justify-center">{action}</div>}
    </div>
  )
}

export function Hint({ text, children }: { text: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="a-pop absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 z-40 w-max max-w-[280px] px-2.5 py-1.5 rounded-lg bg-invert-bg text-invert-ink text-[12px] font-normal leading-snug shadow-pop pointer-events-none"
        >
          {text}
        </span>
      )}
    </span>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center h-[19px] min-w-[19px] px-1.5 rounded-[5px] border border-line bg-surface-2 text-[11px] font-medium text-ink-2 font-sans">
      {children}
    </kbd>
  )
}
