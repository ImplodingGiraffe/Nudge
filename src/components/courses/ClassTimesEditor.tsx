import { useId, useMemo, useState } from 'react'
import { Calendar, Clock, MapPin, Plus, Trash2 } from 'lucide-react'
import type { Meeting, MeetingKind } from '../../lib/types'
import { uid } from '../../lib/id'
import {
  KIND,
  MEETING_KINDS,
  dayLetter,
  dayShort,
  groupMeetings,
  hopBetween,
  parsePlace,
} from '../../lib/meetings'
import { fmtDuration } from '../../lib/date'
import { Button, Input } from '../ui'
import { cx } from '../../lib/ui'

interface Row {
  key: string
  days: number[]
  start: number
  end: number
  kind: MeetingKind
  room: string
  startsOn: string
  endsOn: string
  ids: Record<number, string>
}
const toTimeInput = (min: number) =>
  `${`${Math.floor(min / 60)}`.padStart(2, '0')}:${`${min % 60}`.padStart(2, '0')}`
const fromTimeInput = (v: string) => {
  const [h, m] = v.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const dateInput = (date: Date) => {
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const dayFromDateInput = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).getDay()
}

const isSingleDateRow = (row: Pick<Row, 'startsOn' | 'endsOn'>) =>
  !!row.startsOn && !!row.endsOn && row.startsOn === row.endsOn

const rangesOverlap = (a: Pick<Row, 'startsOn' | 'endsOn'>, b: Pick<Row, 'startsOn' | 'endsOn'>) =>
  isSingleDateRow(a) !== isSingleDateRow(b)
    ? false
    : isSingleDateRow(a) && isSingleDateRow(b)
      ? a.startsOn === b.startsOn
      : (!a.endsOn || !b.startsOn || a.endsOn >= b.startsOn) &&
        (!b.endsOn || !a.startsOn || b.endsOn >= a.startsOn)

const rowsFrom = (meetings: Meeting[]): Row[] =>
  groupMeetings(meetings).map((g) => ({
    key: g.members[0]?.id ?? uid(),
    days: g.days,
    start: g.start,
    end: g.end,
    kind: g.kind,
    room: g.room ?? '',
    startsOn: g.startsOn ?? '',
    endsOn: g.endsOn ?? '',
    ids: Object.fromEntries(g.members.map((m) => [m.day, m.id])),
  }))

const toMeetings = (rows: Row[]): Meeting[] =>
  rows.flatMap((r) =>
    r.days.map((d) => ({
      id: r.ids[d] ?? uid(),
      day: d,
      start: r.start,
      end: Math.max(r.end, r.start + 15),
      kind: r.kind,
      room: r.room.trim() || undefined,
      startsOn: r.startsOn || undefined,
      endsOn: r.endsOn || undefined,
    })),
  )

export function ClassTimesEditor({
  meetings,
  onChange,
  buildings,
  defaultRoom,
}: {
  meetings: Meeting[]
  onChange: (next: Meeting[]) => void
  buildings: string[]
  defaultRoom?: string
}) {
  const [rows, setRows] = useState<Row[]>(() => rowsFrom(meetings))
  const listId = `buildings-${useId()}`

  const commit = (next: Row[]) => {
    setRows(next)
    onChange(toMeetings(next))
  }

  const patch = (key: string, p: Partial<Row>) =>
    commit(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const toggleDay = (row: Row, day: number) => {
    const days = row.days.includes(day) ? row.days.filter((d) => d !== day) : [...row.days, day]
    patch(row.key, { days: days.sort((a, b) => a - b), ids: { ...row.ids, [day]: row.ids[day] ?? uid() } })
  }

  const addWeekly = () => {
    const last = rows[rows.length - 1]
    const nextWeekday = (d: number) => (d >= 5 || d === 0 ? 1 : d + 1)
    commit([
      ...rows,
      {
        key: uid(),
        days: [last ? nextWeekday(last.days[last.days.length - 1] ?? 1) : 1],
        start: last?.start ?? 10 * 60 + 5,
        end: last?.end ?? 11 * 60 + 25,
        kind: last ? (last.kind === 'lecture' ? 'tutorial' : 'lecture') : 'lecture',
        room: last?.room ?? '',
        startsOn: '',
        endsOn: '',
        ids: {},
      },
    ])
  }

  const addOneOff = () => {
    const last = rows[rows.length - 1]
    const date = dateInput(new Date())
    commit([
      ...rows,
      {
        key: uid(),
        days: [dayFromDateInput(date)],
        start: last?.start ?? 10 * 60 + 5,
        end: last?.end ?? 11 * 60 + 25,
        kind: last ? (last.kind === 'lecture' ? 'tutorial' : 'lecture') : 'lecture',
        room: last?.room ?? '',
        startsOn: date,
        endsOn: date,
        ids: {},
      },
    ])
  }

  const crossings = useMemo(() => {
    const out: { day: number; text: string; tight: boolean }[] = []
    for (let day = 0; day < 7; day++) {
      const onDay = rows
        .filter((r) => r.days.includes(day))
        .map((r) => ({
          start: r.start * 60_000,
          end: r.end * 60_000,
          place: parsePlace(r.room || defaultRoom),
          row: r,
        }))
        .sort((a, b) => a.start - b.start)
      for (let i = 1; i < onDay.length; i++) {
        if (!rangesOverlap(onDay[i - 1].row, onDay[i].row)) continue
        const hop = hopBetween(onDay[i - 1], onDay[i])
        if (!hop || (!hop.tight && !hop.clash)) continue
        out.push({
          day,
          tight: true,
          text: hop.clash
            ? `${dayShort(day)}: ${hop.from.building} and ${hop.to.building} overlap`
            : `${dayShort(day)}: ${hop.gapMin} min from ${hop.from.building} to ${hop.to.building}`,
        })
      }
    }
    return out
  }, [rows, defaultRoom])

  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
          <Clock size={15} className="text-ink-3" />
          Class times
        </span>
        <div className="flex items-center gap-1.5">
          <Button size="sm" type="button" onClick={addWeekly}>
            <Plus size={13} />
            Add weekly
          </Button>
          <Button size="sm" type="button" onClick={addOneOff}>
            <Plus size={13} />
            Add one-off
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <button
          type="button"
          onClick={addWeekly}
          className="w-full rounded-xl border border-dashed border-line-2 bg-surface-2 px-4 py-4 text-center hover:border-ink/30 hover:bg-tint transition-colors group cursor-pointer"
        >
          <Clock size={18} className="mx-auto text-ink-3 group-hover:text-ink-2 transition-colors" />
          <p className="mt-1.5 text-[13px] font-medium text-ink">Add a weekly schedule</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3 leading-snug">
            Add weekly lectures, labs, or tutorials, or use Add one-off for a single date.
          </p>
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map((row) => (
            <RowCard
              key={row.key}
              row={row}
              listId={listId}
              defaultRoom={defaultRoom}
              onToggleDay={(d) => toggleDay(row, d)}
              onPatch={(p) => patch(row.key, p)}
              onRemove={() => commit(rows.filter((r) => r.key !== row.key))}
            />
          ))}
        </div>
      )}

      <datalist id={listId}>
        {buildings.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      {crossings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {crossings.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-snug text-[var(--c-warn)]">
              <MapPin size={12} className="shrink-0 mt-[1px]" aria-hidden />
              <span>{c.text}. Protected travel time.</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
function RowCard({
  row,
  listId,
  defaultRoom,
  onToggleDay,
  onPatch,
  onRemove,
}: {
  row: Row
  listId: string
  defaultRoom?: string
  onToggleDay: (day: number) => void
  onPatch: (p: Partial<Row>) => void
  onRemove: () => void
}) {
  const mins = Math.max(15, row.end - row.start)
  const singleDate = isSingleDateRow(row)
  const hasDates = !singleDate && !!(row.startsOn || row.endsOn)
  const [showDates, setShowDates] = useState(hasDates)

  const setScheduleMode = (mode: 'weekly' | 'single') => {
    if (mode === 'single' && !singleDate) {
      const date = row.startsOn || dateInput(new Date())
      setShowDates(false)
      onPatch({ startsOn: date, endsOn: date, days: [dayFromDateInput(date)] })
      return
    }
    if (mode === 'weekly' && singleDate) {
      setShowDates(false)
      onPatch({ startsOn: '', endsOn: '', days: row.days.length ? row.days : [1] })
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3 flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="Class type"
            className="inline-flex bg-surface border border-line rounded-lg p-[2px]"
          >
            {MEETING_KINDS.map((k) => {
              const spec = KIND[k]
              const Icon = spec.icon
              const active = row.kind === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onPatch({ kind: k })}
                  className={cx(
                    'h-7 px-2.5 rounded-[6px] flex items-center gap-1.5 text-[12px] font-medium transition-all cursor-pointer',
                    active
                      ? 'bg-surface-2 text-ink shadow-xs font-semibold'
                      : 'text-ink-3 hover:text-ink',
                  )}
                >
                  <Icon size={13} className={active ? 'text-ink' : 'text-ink-3'} />
                  <span>{spec.label}</span>
                </button>
              )
            })}
          </div>
          <div
            role="radiogroup"
            aria-label="Schedule mode"
            className="inline-flex bg-surface border border-line rounded-lg p-[2px]"
          >
            {(['weekly', 'single'] as const).map((mode) => {
              const active = mode === (singleDate ? 'single' : 'weekly')
              return (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setScheduleMode(mode)}
                  className={cx(
                    'h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-all cursor-pointer',
                    active
                      ? 'bg-surface-2 text-ink shadow-xs font-semibold'
                      : 'text-ink-3 hover:text-ink',
                  )}
                >
                  {mode === 'weekly' ? 'Weekly' : 'Single date'}
                </button>
              )
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this class time"
          className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-tint transition-colors cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {singleDate ? (
        <div>
          <span className="block text-[11px] font-medium text-ink-3 mb-1">Session date</span>
          <Input
            type="date"
            value={row.startsOn}
            onChange={(e) => {
              const startsOn = e.target.value
              if (!startsOn) return
              onPatch({ startsOn, endsOn: startsOn, days: [dayFromDateInput(startsOn)] })
            }}
            className="h-8 text-[12px]"
          />
          <p className="mt-1 text-[11px] text-ink-3">{dayShort(dayFromDateInput(row.startsOn))}</p>
        </div>
      ) : (
        <div>
          <span className="block text-[11px] font-medium text-ink-3 mb-1">Meets on</span>
          <div role="group" aria-label="Meeting days" className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const on = row.days.includes(d)
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onToggleDay(d)}
                  aria-pressed={on}
                  aria-label={dayShort(d)}
                  title={dayShort(d)}
                  className={cx(
                    'h-8 flex-1 max-w-[42px] rounded-lg text-[12px] font-semibold transition-all cursor-pointer',
                    on
                      ? 'bg-ink text-surface shadow-xs'
                      : 'bg-surface border border-line text-ink-3 hover:border-line-2 hover:text-ink',
                  )}
                >
                  {dayLetter(d)}
                </button>
              )
            })}
          </div>
          {row.days.length === 0 && (
            <p className="mt-1 text-[11px] text-[var(--c-warn)]">Select at least one day.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="block text-[11px] font-medium text-ink-3 mb-1">Starts at</span>
          <Input
            type="time"
            value={toTimeInput(row.start)}
            onChange={(e) => {
              const start = fromTimeInput(e.target.value)
              onPatch({ start, end: Math.max(row.end, start + 15) })
            }}
            className="h-8 text-[12px]"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-medium text-ink-3">Ends at</span>
            <span className="text-[10.5px] text-ink-3 tnum">{fmtDuration(mins)}</span>
          </div>
          <Input
            type="time"
            value={toTimeInput(row.end)}
            onChange={(e) => onPatch({ end: Math.max(fromTimeInput(e.target.value), row.start + 15) })}
            className="h-8 text-[12px]"
          />
        </div>
      </div>

      <div>
        <span className="block text-[11px] font-medium text-ink-3 mb-1">Room or building</span>
        <div className="relative">
          <MapPin size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
          <Input
            list={listId}
            value={row.room}
            onChange={(e) => onPatch({ room: e.target.value })}
            placeholder={defaultRoom ? `${defaultRoom} (course default)` : 'e.g. Leacock 132 or Online'}
            className="h-8 text-[12px] pl-8"
            spellCheck={false}
          />
        </div>
      </div>

      {!singleDate && !showDates && !hasDates ? (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => setShowDates(true)}
            className="text-[11px] text-ink-3 hover:text-ink transition-colors inline-flex items-center gap-1 cursor-pointer"
          >
            <Calendar size={11} />
            <span>Limit to specific date range...</span>
          </button>
        </div>
      ) : !singleDate ? (
        <div className="pt-2 border-t border-line/60 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-2">Date range</span>
            <button
              type="button"
              onClick={() => {
                setShowDates(false)
                onPatch({ startsOn: '', endsOn: '' })
              }}
              className="text-[10.5px] text-ink-3 hover:text-ink cursor-pointer"
            >
              Clear (runs all semester)
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[10.5px] text-ink-3 mb-1">From</span>
              <Input
                type="date"
                value={row.startsOn}
                onChange={(e) => {
                  const startsOn = e.target.value
                  onPatch({ startsOn, ...(row.endsOn && startsOn > row.endsOn ? { endsOn: startsOn } : {}) })
                }}
                className="h-8 text-[11.5px]"
              />
            </div>
            <div>
              <span className="block text-[10.5px] text-ink-3 mb-1">To</span>
              <Input
                type="date"
                value={row.endsOn}
                min={row.startsOn || undefined}
                onChange={(e) => {
                  const endsOn = e.target.value
                  onPatch({ endsOn, ...(row.startsOn && endsOn < row.startsOn ? { startsOn: endsOn } : {}) })
                }}
                className="h-8 text-[11.5px]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
