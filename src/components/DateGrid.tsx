import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, fromDateValue, isSameDay, startOfDay, toDateValue } from '../lib/date'
import { cx } from '../lib/ui'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function DateGrid({
  value,
  now,
  onSelect,
}: {

  value: string
  now: number
  onSelect: (value: string) => void
}) {
  const selected = useMemo(() => (value ? fromDateValue(value) : startOfDay(now)), [value, now])
  const [month, setMonth] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1))

  const cells = useMemo(() => {

    const lead = (month.getDay() + 6) % 7
    const first = addDays(month, -lead)
    return Array.from({ length: 42 }, (_, i) => addDays(first, i))
  }, [month])

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <div className="mt-2.5 p-2.5 rounded-xl border border-line bg-surface w-[248px]">
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className="h-7 w-7 grid place-items-center rounded-lg text-ink-2 hover:bg-tint transition-colors"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] font-semibold text-ink tnum">
          {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="Next month"
          className="h-7 w-7 grid place-items-center rounded-lg text-ink-2 hover:bg-tint transition-colors"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5" role="grid">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="h-6 grid place-items-center text-[10.5px] font-medium text-ink-3" aria-hidden>
            {d}
          </span>
        ))}
        {cells.map((d) => {
          const outside = d.getMonth() !== month.getMonth()
          const isSelected = isSameDay(d, selected)
          const isToday = isSameDay(d, now)
          return (
            <button
              key={+d}
              type="button"
              onClick={() => onSelect(toDateValue(d))}
              aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              aria-pressed={isSelected}
              className={cx(
                'h-[30px] rounded-lg text-[12.5px] tnum transition-colors',
                isSelected
                  ? 'bg-invert-bg text-invert-ink font-semibold'
                  : outside
                    ? 'text-ink-3/50 hover:bg-tint'
                    : 'text-ink hover:bg-tint',
                isToday && !isSelected && 'font-semibold ring-1 ring-inset ring-line-2',
              )}
            >
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
