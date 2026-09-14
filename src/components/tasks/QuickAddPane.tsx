import { useMemo, useState } from 'react'
import { CalendarDays, Check, CornerDownLeft, Plus } from 'lucide-react'
import type { Course } from '../../lib/types'
import { fmtDayShort, fromDateValue, quickAddDays } from '../../lib/date'
import { colorOf, solidOf } from '../../lib/theme'
import { subjectIcon } from '../../lib/subjectIcon'
import { Input, Kbd } from '../ui'
import { cx } from '../../lib/ui'
import { DateGrid } from '../DateGrid'

export interface QuickAddValue {
  title: string
  courseId: string

  date: string

  newCourseCode: string | null
}

export interface QuickAddPaneProps {
  value: QuickAddValue
  courses: Course[]
  now: number
  cleanTitle: string
  dueLabel: string
  error?: string
  detected?: { bits: string[] } | null
  onApplyDetected?: () => void
  onChange: (patch: Partial<QuickAddValue>) => void
  onSubmit: () => void
}

export function QuickAddPane({
  value,
  courses,
  now,
  cleanTitle,
  dueLabel,
  error,
  detected,
  onApplyDetected,
  onChange,
  onSubmit,
}: QuickAddPaneProps) {
  const days = useMemo(() => quickAddDays(now), [now])

  const customDate = !days.some((d) => d.key === value.date)

  const [showGrid, setShowGrid] = useState(false)

  return (
    <div className="flex flex-col gap-5">
      <Input
        data-autofocus
        value={value.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="What needs doing?"
        className="h-12 text-[16px]"
        aria-label="Task name"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          onSubmit()
        }}
      />
      <p className="-mt-3 text-[12px] leading-snug text-ink-3">
        Quick add creates work to do. For an in-person exam, use Plan → Exam.
      </p>
      {error && <p className="-mt-3 text-[12px] leading-snug text-critical">{error}</p>}
      {detected && (
        <button
          type="button"
          onClick={onApplyDetected}
          className="-mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-tint hover:bg-tint-2 transition-colors text-left"
        >
          <span className="text-[12.5px] text-ink-2 flex-1 leading-snug">
            Read that as <span className="text-ink font-medium">{detected.bits.join(' · ')}</span>
          </span>
          <span className="text-[12.5px] font-semibold text-ink shrink-0">Review</span>
        </button>
      )}

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-2">Course</p>
        <div className="flex flex-wrap gap-2">
          {courses.map((c) => {
            const Icon = subjectIcon(c.code)
            const on = value.courseId === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange({ courseId: on ? '' : c.id, newCourseCode: null })}
                aria-pressed={on}
                className={cx(
                  'relative w-[104px] h-[70px] rounded-xl border text-left px-2.5 py-2 flex flex-col justify-between',
                  'transition-all duration-150 active:scale-[.97]',
                  on ? 'border-transparent ring-2' : 'border-line hover:border-line-2',
                )}
                style={{
                  background: on ? solidOf(c, 18) : undefined,
                  ...(on ? ({ '--tw-ring-color': colorOf(c) } as React.CSSProperties) : {}),
                }}
              >
                <Icon size={20} style={{ color: colorOf(c) }} aria-hidden />
                <span className="text-[12.5px] font-semibold text-ink leading-tight">{c.code}</span>
                {on && (
                  <span
                    className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full grid place-items-center text-invert-ink"
                    style={{ background: colorOf(c) }}
                  >
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}

          {value.newCourseCode && (
            <button
              type="button"
              onClick={() => onChange({ courseId: '' })}
              aria-pressed
              className="w-[104px] h-[70px] rounded-xl border-2 border-dashed border-line-2 px-2.5 py-2 flex flex-col justify-between text-left"
            >
              <Plus size={17} className="text-ink-3" aria-hidden />
              <span className="text-[12.5px] font-semibold text-ink leading-tight">
                {value.newCourseCode}
                <span className="block text-[10.5px] font-normal text-ink-3">new course</span>
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onChange({ courseId: '', newCourseCode: null })}
            aria-pressed={!value.courseId && !value.newCourseCode}
            className={cx(
              'w-[104px] h-[70px] rounded-xl border text-left px-2.5 py-2 flex flex-col justify-between transition-all active:scale-[.97]',
              !value.courseId && !value.newCourseCode
                ? 'border-ink bg-tint'
                : 'border-line hover:border-line-2',
            )}
          >
            <span className="h-[17px] w-[17px] rounded-full border-2 border-ink-3" aria-hidden />
            <span className="text-[12.5px] font-semibold text-ink-2 leading-tight">No course</span>
          </button>
        </div>
      </section>

      <section>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-2">Due</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {days.map((d) => {
            const on = value.date === d.key
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => onChange({ date: d.key })}
                aria-pressed={on}
                className={cx(
                  'h-9 px-3 rounded-[10px] text-[13px] font-medium transition-colors',
                  on ? 'bg-invert-bg text-invert-ink' : 'bg-tint text-ink-2 hover:bg-tint-2',
                )}
              >
                {d.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowGrid((v) => !v)}
            aria-expanded={showGrid}
            aria-label="Pick a due date"
            className={cx(
              'h-9 px-2.5 rounded-[10px] text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors',
              customDate || showGrid ? 'bg-invert-bg text-invert-ink' : 'bg-tint text-ink-2 hover:bg-tint-2',
            )}
          >
            <CalendarDays size={14} aria-hidden />
            {customDate ? fmtDayShort(fromDateValue(value.date)) : 'Pick'}
          </button>
        </div>

        {showGrid && (
          <DateGrid
            value={value.date}
            now={now}
            onSelect={(v) => {
              onChange({ date: v })
              setShowGrid(false)
            }}
          />
        )}
      </section>

      <div className="flex items-center gap-2 pt-1 border-t border-line -mb-1">
        <p className="flex-1 min-w-0 text-[12.5px] text-ink-3 pt-3 leading-snug">
          {cleanTitle ? (
            <>
              <span className="text-ink font-medium">{cleanTitle}</span>
              {' · '}
              {value.courseId
                ? courses.find((c) => c.id === value.courseId)?.code
                : (value.newCourseCode ?? 'No course')}
              {' · '}
              {dueLabel}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              Type a name, then <Kbd>↵</Kbd> to add
            </span>
          )}
        </p>
        <CornerDownLeft size={14} className="text-ink-3 shrink-0 mt-2" aria-hidden />
      </div>
    </div>
  )
}
