import { useMemo, useState } from 'react'
import { LineChart, Table2 } from 'lucide-react'
import type { Derived } from '../../lib/derive'
import { useStore } from '../../lib/store'
import { estimateAccuracy, gradeOutlook, heatmap, weekMinutesByCourse } from '../../lib/stats'
import { addDays, fmtDayShort, fmtDuration, fromDayKey, startOfWeek } from '../../lib/date'
import { colorOf } from '../../lib/theme'
import { Card, CourseDot, EmptyState, PageHeader, PeriodNavigator, SectionTitle } from '../ui'
import { cx } from '../../lib/ui'

export function Progress({ derived, now }: { derived: Derived; now: number }) {
  const courses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const settings = useStore((s) => s.settings)

  const sessions = derived.sessions
  const [weekOffset, setWeekOffset] = useState(0)

  const weekStart = useMemo(() => addDays(startOfWeek(now), weekOffset * 7), [now, weekOffset])
  const byCourseThisWeek = useMemo(() => weekMinutesByCourse(sessions, weekStart), [sessions, weekStart])

  const rows = useMemo(() => {
    const list = courses
      .filter((c) => !c.archived)
      .map((c) => ({ id: c.id, label: c.code, minutes: byCourseThisWeek.get(c.id) ?? 0, color: colorOf(c) }))
    const other = byCourseThisWeek.get('__none__') ?? 0
    if (other > 0) list.push({ id: '__none__', label: 'Unassigned', minutes: other, color: 'var(--c-ink-3)' })
    return list.sort((a, b) => b.minutes - a.minutes)
  }, [courses, byCourseThisWeek])

  const weekTotal = rows.reduce((s, r) => s + r.minutes, 0)
  const prevWeekTotal = useMemo(() => {
    const m = weekMinutesByCourse(sessions, addDays(weekStart, -7))
    return [...m.values()].reduce((s, v) => s + v, 0)
  }, [sessions, weekStart])

  const open = assignments.filter((a) => a.status !== 'done' && !a.archived)
  const done = assignments.filter((a) => a.status === 'done' && !a.archived)

  const accuracy = useMemo(
    () => estimateAccuracy(assignments, derived.byAssignment),
    [assignments, derived.byAssignment],
  )

  const heatFrom = useMemo(() => {
    if (settings.termStart) return fromDayKey(settings.termStart)
    const earliest = sessions.reduce((m, s) => Math.min(m, +new Date(s.start)), +now)
    return startOfWeek(Math.min(earliest, +addDays(now, -56)))
  }, [settings.termStart, sessions, now])

  const heatTo = useMemo(() => {
    const end = settings.termEnd ? fromDayKey(settings.termEnd) : addDays(now, 14)
    return addDays(startOfWeek(end), 6)
  }, [settings.termEnd, now])

  const cells = useMemo(() => heatmap(sessions, startOfWeek(heatFrom), heatTo, now), [sessions, heatFrom, heatTo, now])

  if (sessions.length === 0 && assignments.length === 0) {
    return (
      <div className="px-3 sm:px-6 py-6 max-w-[900px] mx-auto">
        <Card>
          <EmptyState
            icon={<LineChart size={20} />}
            title="Nothing to chart yet"
            body="Log study sessions to see your time by course, estimate accuracy, and progress toward grade targets."
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="px-3 sm:px-6 pt-4 sm:pt-7 pb-8 max-w-[1180px] mx-auto flex flex-col gap-5">
      <PageHeader title="Progress" description="See your study patterns, workload, and grade trajectory." />

      <section>
        <SectionTitle
          right={
            <PeriodNavigator
              title={weekOffset === 0 ? 'This week' : `${fmtDayShort(weekStart)}–${fmtDayShort(addDays(weekStart, 6))}`}
              onPrevious={() => setWeekOffset((w) => w - 1)}
              onNext={() => setWeekOffset((w) => Math.min(0, w + 1))}
              nextDisabled={weekOffset >= 0}
            />
          }
        >
          Study time by course
        </SectionTitle>

        <Card className="p-4">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-[34px] font-semibold text-ink leading-none tracking-[-0.02em]">
              {(weekTotal / 60).toFixed(weekTotal % 60 === 0 ? 0 : 1)}
              <span className="text-[16px] font-medium text-ink-3 ml-1">hrs</span>
            </span>
            {prevWeekTotal > 0 && (
              <span
                className={cx(
                  'text-[12.5px] font-medium',
                  weekTotal >= prevWeekTotal ? 'text-[var(--c-good-ink)]' : 'text-ink-3',
                )}
              >
                {weekTotal >= prevWeekTotal ? '▲' : '▼'} {fmtDuration(Math.abs(weekTotal - prevWeekTotal))} vs last
                week
              </span>
            )}
          </div>

          {weekTotal === 0 ? (
            <p className="text-[13px] text-ink-3 py-4 text-center">No study time logged this week yet.</p>
          ) : (
            <BarList rows={rows} />
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Assignments</SectionTitle>
        <Card className="p-4">
          <div className="flex flex-wrap gap-6 mb-4">
            <Stat label="Done" value={done.length} />
            <Stat label="Open" value={open.length} />
            <Stat
              label="Overdue"
              value={derived.ranked.filter((r) => r.verdict === 'overdue').length}
              tone={derived.ranked.some((r) => r.verdict === 'overdue') ? 'critical' : undefined}
            />
            <Stat label="Due this week" value={derived.ranked.filter((r) => r.daysUntil >= 0 && r.daysUntil <= 7).length} />
          </div>
          {done.length + open.length > 0 && (
            <>
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-sunken" role="img" aria-label={`${done.length} done, ${open.length} open`}>
                <div
                  className="h-full transition-[width] duration-500"
                  style={{
                    width: `${(done.length / (done.length + open.length)) * 100}%`,
                    background: 'var(--c-ink)',
                    marginRight: 2,
                  }}
                />
                <div className="h-full flex-1" style={{ background: 'var(--c-line-2)' }} />
              </div>
              <p className="mt-2 text-[12px] text-ink-3">
                <span className="text-ink font-medium tnum">
                  {Math.round((done.length / (done.length + open.length)) * 100)}%
                </span>{' '}
                of everything you've logged this term is finished.
              </p>
            </>
          )}
        </Card>
      </section>

      {courses.filter((c) => !c.archived).length > 0 && (
        <section>
          <SectionTitle>Grade trajectory</SectionTitle>
          <Card className="p-4 flex flex-col gap-3.5">
            {courses
              .filter((c) => !c.archived)
              .map((c) => {
                const o = gradeOutlook(c, assignments)
                return (
                  <div key={c.id}>
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        <CourseDot course={c} size={14} />
                        {c.code}
                      </span>
                      <span className="text-[12.5px] tnum text-ink-2">
                        {o.display != null ? `${o.display}%` : 'no marks yet'}
                        {o.target != null && <span className="text-ink-3"> → {o.target}%</span>}
                      </span>
                    </div>
                    <div className="relative h-[8px] w-full rounded-full bg-sunken overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-500"
                        style={{ width: `${Math.min(100, o.display ?? 0)}%`, background: colorOf(c) }}
                      />
                      {o.target != null && (
                        <span
                          className="absolute top-0 h-full w-[2px] bg-ink/45"
                          style={{ left: `calc(${Math.min(100, o.target)}% - 1px)` }}
                          aria-hidden
                        />
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      {o.gradedWeight > 0
                        ? `${Math.round(o.gradedWeight)}% of the grade decided`
                        : 'Nothing marked yet'}
                      {o.needed != null && o.remainingWeight > 0 && !o.outOfReach && (
                        <> · need {Math.max(0, o.needed)}% on what's left</>
                      )}
                      {o.outOfReach && <span className="text-[var(--c-critical-ink)]"> · target out of reach</span>}
                    </p>
                  </div>
                )
              })}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>Estimated vs actual</SectionTitle>
        <Card className="p-4">
          {accuracy.rows.length === 0 ? (
            <p className="text-[13px] text-ink-3 leading-relaxed">
              Complete a few timed tasks to compare your estimates with the time you actually spend.
            </p>
          ) : (
            <>
              <p className="text-[13.5px] text-ink-2 leading-relaxed mb-3">
                Across {accuracy.rows.length} finished task{accuracy.rows.length === 1 ? '' : 's'}, things took you{' '}
                <span className="text-ink font-semibold tnum">
                  {accuracy.ratio >= 1
                    ? `${Math.round((accuracy.ratio - 1) * 100)}% longer`
                    : `${Math.round((1 - accuracy.ratio) * 100)}% less time`}
                </span>{' '}
                than you planned.
                {derived.calibration.samples >= 3 && ' Nudge already factors this into new plans.'}
              </p>
              <div className="overflow-x-auto scroll-slim -mx-1 px-1">
                <table className="w-full text-[12.5px] min-w-[320px]">
                  <thead>
                    <tr className="text-ink-3 text-left">
                      <th className="font-medium pb-1.5 pr-2">Task</th>
                      <th className="font-medium pb-1.5 px-2 text-right tnum">Est.</th>
                      <th className="font-medium pb-1.5 px-2 text-right tnum">Actual</th>
                      <th className="font-medium pb-1.5 pl-2 text-right tnum">Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accuracy.rows.slice(0, 6).map((r) => {
                      const diff = r.actualMin - r.estimateMin
                      return (
                        <tr key={r.assignment.id} className="border-t border-line">
                          <td className="py-1.5 pr-2 text-ink truncate max-w-[220px]">{r.assignment.title}</td>
                          <td className="py-1.5 px-2 text-right tnum text-ink-2">{fmtDuration(r.estimateMin)}</td>
                          <td className="py-1.5 px-2 text-right tnum text-ink-2">{fmtDuration(r.actualMin)}</td>
                          <td
                            className={cx(
                              'py-1.5 pl-2 text-right tnum font-medium',
                              diff > 0 ? 'text-[var(--c-serious)]' : 'text-[var(--c-good-ink)]',
                            )}
                          >
                            {diff > 0 ? '+' : '−'}
                            {fmtDuration(Math.abs(diff))}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Study activity</SectionTitle>
        <Card className="p-4">
          <Heatmap cells={cells} />
        </Card>
      </section>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'critical' }) {
  return (
    <div>
      <div
        className={cx(
          'text-[26px] font-semibold leading-none tracking-[-0.02em]',
          tone === 'critical' && value > 0 ? 'text-[var(--c-critical-ink)]' : 'text-ink',
        )}
      >
        {value}
      </div>
      <div className="text-[12px] text-ink-3 mt-1">{label}</div>
    </div>
  )
}

function BarList({ rows }: { rows: { id: string; label: string; minutes: number; color: string }[] }) {
  const [table, setTable] = useState(false)
  const max = Math.max(...rows.map((r) => r.minutes), 30)

  if (table) {
    return (
      <>
        <table className="w-full text-[13px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line first:border-t-0">
                <td className="py-1.5 text-ink">{r.label}</td>
                <td className="py-1.5 text-right tnum text-ink-2">{fmtDuration(r.minutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ToggleData table={table} setTable={setTable} />
      </>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-3">
            <span className="w-[76px] shrink-0 text-[12.5px] font-medium text-ink truncate">{r.label}</span>
            <div className="flex-1 h-[10px] flex items-center">
              {r.minutes > 0 && (
                <div
                  className="h-full rounded-r-[4px] transition-[width] duration-500 ease-[var(--ease-out-soft)]"
                  style={{ width: `${Math.max(1.5, (r.minutes / max) * 100)}%`, background: r.color }}
                />
              )}
            </div>
            <span className="w-[52px] shrink-0 text-right text-[12px] tnum text-ink-2">
              {r.minutes > 0 ? fmtDuration(r.minutes) : '—'}
            </span>
          </div>
        ))}
      </div>
      <ToggleData table={table} setTable={setTable} />
    </>
  )
}

function ToggleData({ table, setTable }: { table: boolean; setTable: (v: boolean) => void }) {
  return (
    <button
      onClick={() => setTable(!table)}
      className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink transition-colors"
    >
      <Table2 size={12} />
      {table ? 'Show chart' : 'Show data'}
    </button>
  )
}

function Heatmap({ cells }: { cells: ReturnType<typeof heatmap> }) {
  const weeks = useMemo(() => {
    const out: (typeof cells)[] = []
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7))
    return out
  }, [cells])

  const shades = ['var(--c-sunken)', 'var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)']
  const total = cells.reduce((s, c) => s + c.minutes, 0)
  const activeDays = cells.filter((c) => c.minutes >= 20).length

  return (
    <div>
      <div className="flex gap-2 items-start overflow-x-auto scroll-slim pb-1.5">
        <div className="flex flex-col gap-[3px] shrink-0 pt-[1px]">
          {['M', '', 'W', '', 'F', '', ''].map((d, i) => (
            <span key={i} className="h-[13px] text-[9.5px] text-ink-3 leading-[13px] w-3">
              {d}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((c) => (
                <span
                  key={c.day}
                  title={`${fmtDayShort(fromDayKey(c.day))} · ${c.minutes > 0 ? fmtDuration(c.minutes) : 'nothing'}`}
                  className={cx(
                    'h-[13px] w-[13px] rounded-[3px] transition-transform hover:scale-125',
                    c.future && 'opacity-35',
                  )}
                  style={{ background: shades[c.level] }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[12px] text-ink-3 tnum">
          {activeDays} study day{activeDays === 1 ? '' : 's'} · {fmtDuration(total)} this term
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <span>Less</span>
          {shades.map((s, i) => (
            <span key={i} className="h-[11px] w-[11px] rounded-[3px]" style={{ background: s }} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}
