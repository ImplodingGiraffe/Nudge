import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Plus, Sparkles, X, Zap } from 'lucide-react'
import type { Assignment, Course, PlannerEvent, ScheduleOverride, StudyBlock, TaskKind } from '../../lib/types'
import { useStore } from '../../lib/store'
import { KIND_LABEL, carriesWeight, defaultWeight } from '../../lib/priority'
import { parseQuickAdd } from '../../lib/parse'
import { addDays, fromDateValue, fmtDay, fmtDuration, MIN, startOfDay } from '../../lib/date'
import { Button, CourseDot, Field, Input, Segmented, Select, Sheet, Textarea } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import { QuickAddPane } from './QuickAddPane'
import { normalizeCode } from '../../lib/store'
import { useNow } from '../../lib/hooks'
import { classesOn } from '../../lib/meetings'

const KINDS = Object.keys(KIND_LABEL) as TaskKind[]
const ESTIMATES = [15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900]

const pad = (n: number) => `${n}`.padStart(2, '0')
const dateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

interface Draft {
  title: string
  courseId: string
  date: string
  time: string
  kind: TaskKind
  weight: string
  estimateMin: string
  notes: string
  steps: string[]
  addToToday: boolean
}

const emptyDraft = (now: Date, courseId: string): Draft => ({
  title: '',
  courseId,
  date: dateValue(now),
  time: '23:59',
  kind: 'assignment',
  weight: '',
  estimateMin: '',
  notes: '',
  steps: [],
  addToToday: false,
})

const FALLBACK_DUE_TIME = '23:59'

const timeValue = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

interface DueSuggestion {
  date: string
  time: string
}

function dueSuggestionForDay(
  course: Course,
  date: string,
  plannerEvents: PlannerEvent[],
  scheduleOverrides: ScheduleOverride[],
  blocks: StudyBlock[],
): DueSuggestion {
  const day = fromDateValue(date)
  const firstClass = classesOn([course], day, { plannerEvents, scheduleOverrides, blocks })[0]
  return {
    date,
    time: firstClass ? timeValue(new Date(firstClass.start - MIN)) : FALLBACK_DUE_TIME,
  }
}

function nextCourseDue(
  course: Course,
  fromMs: number,
  plannerEvents: PlannerEvent[],
  scheduleOverrides: ScheduleOverride[],
  blocks: StudyBlock[],
): DueSuggestion {
  const firstDay = startOfDay(fromMs)
  for (let offset = 0; offset <= 366; offset++) {
    const day = addDays(firstDay, offset)
    const nextClass = classesOn([course], day, { plannerEvents, scheduleOverrides, blocks }).find(
      (occurrence) => occurrence.start > fromMs,
    )
    if (nextClass) {
      return {
        date: dateValue(day),
        time: timeValue(new Date(nextClass.start - MIN)),
      }
    }
  }
  return { date: dateValue(firstDay), time: FALLBACK_DUE_TIME }
}

export function NewTaskSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const store = useStore()
  const courses = useStore((s) => s.courses).filter((c) => !c.archived)
  const blocks = useStore((s) => s.blocks)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const scheduleOverrides = useStore((s) => s.scheduleOverrides)
  const { toast } = useToast()
  const mode = useStore((s) => s.settings.addMode)
  const now = useNow()
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(new Date(now), ''))
  const [stepText, setStepText] = useState('')
  const [applied, setApplied] = useState(false)

  const touched = useRef({ course: false, dueDate: false, dueTime: false, kind: false })
  const [newCourseCode, setNewCourseCode] = useState<string | null>(null)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))

  useEffect(() => {
    const raw = draft.title.trim()
    if (raw.length < 3) return
    const p = parseQuickAdd(raw, courses)
    const dueWasUntouched = !touched.current.dueDate
    if (dueWasUntouched && p.dueExplicit) {
      touched.current.dueDate = true
      touched.current.dueTime = true
    }
    setDraft((d) => {
      const next = { ...d }
      if (!touched.current.course && p.courseId) next.courseId = p.courseId
      if (dueWasUntouched && p.dueExplicit) {
        next.date = dateValue(p.due)
        next.time = `${pad(p.due.getHours())}:${pad(p.due.getMinutes())}`
      }
      if ((p.kindExplicit || p.kind !== 'assignment') && !touched.current.kind) next.kind = p.kind
      if (p.weight != null) next.weight = String(p.weight)
      return next
    })
    setNewCourseCode(!p.courseId && p.courseCode ? normalizeCode(p.courseCode) : null)

  }, [draft.title, mode, courses])

  useEffect(() => {
    const course = courses.find((c) => c.id === draft.courseId)
    if (!course) return

    const suggestion = touched.current.dueDate
      ? !touched.current.dueTime
        ? dueSuggestionForDay(course, draft.date, plannerEvents, scheduleOverrides, blocks)
        : null
      : nextCourseDue(course, now, plannerEvents, scheduleOverrides, blocks)
    if (!suggestion) return
    if (suggestion.date === draft.date && suggestion.time === draft.time) return
    setDraft((d) => ({ ...d, date: suggestion.date, time: suggestion.time }))
  }, [blocks, courses, draft.courseId, draft.date, draft.time, now, plannerEvents, scheduleOverrides])

  const updateDate = (date: string, courseId = draft.courseId) => {
    touched.current.dueDate = true
    if (!date) {
      set('date', date)
      return
    }
    const course = courses.find((c) => c.id === courseId)
    const suggestion = course ? dueSuggestionForDay(course, date, plannerEvents, scheduleOverrides, blocks) : null
    setDraft((d) => ({
      ...d,
      date,
      time: !touched.current.dueTime && suggestion ? suggestion.time : d.time,
    }))
  }

  const updateTime = (time: string) => {
    touched.current.dueTime = true
    set('time', time)
  }

  const detected = useMemo(() => {
    if (applied || draft.title.trim().length < 4) return null
    const p = parseQuickAdd(draft.title, courses)
    const bits: string[] = []
    if (p.kind !== 'assignment' || p.kindExplicit) bits.push(KIND_LABEL[p.kind])
    if (p.courseId) bits.push(courses.find((c) => c.id === p.courseId)?.code ?? '')
    if (p.dueExplicit) bits.push(p.due.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }))
    if (p.weight != null) bits.push(`${p.weight}%`)
    if (p.estimateMin != null) bits.push(fmtDuration(p.estimateMin))
    return bits.length && (p.title !== draft.title || p.kind !== 'assignment' || p.kindExplicit)
      ? { p, bits }
      : null
  }, [draft.title, courses, applied])

  const quickParseError =
    mode === 'quick' && draft.title.trim().length >= 3 ? parseQuickAdd(draft.title, courses).error : undefined
  const valid = draft.title.trim().length > 0 && !!draft.date && !quickParseError

  const cleanTitle = useMemo(() => {
    const raw = draft.title.trim()
    if (mode !== 'quick' || raw.length < 3) return raw
    return parseQuickAdd(raw, courses).title
  }, [draft.title, mode, courses])

  const applyDetected = () => {
    if (!detected) return
    const { p } = detected
    setDraft((d) => ({
      ...d,
      title: p.title,
      courseId: p.courseId ?? d.courseId,
      date: p.dueExplicit ? dateValue(p.due) : d.date,
      time: p.dueExplicit ? `${pad(p.due.getHours())}:${pad(p.due.getMinutes())}` : d.time,
      kind: p.kind,
      weight: p.weight != null ? String(p.weight) : d.weight,
      estimateMin: p.estimateMin != null ? String(p.estimateMin) : d.estimateMin,
    }))
    if (p.dueExplicit) {
      touched.current.dueDate = true
      touched.current.dueTime = true
    }
    if (p.courseId) touched.current.course = true
    setApplied(true)
  }

  const submit = (andAnother: boolean) => {
    if (!valid) return
    const due = new Date(`${draft.date}T${draft.time || '23:59'}`)
    const kind = draft.kind
    const weight = draft.weight === '' ? undefined : Number(draft.weight)
    let courseId = draft.courseId
    let createdId: string | null = null
    let createdTitle = ''
    store.batch('Added task', (s) => {
      if (!courseId && newCourseCode) courseId = s.addCourse({ code: newCourseCode }).id
      const created = s.addAssignment({
        title: (mode === 'quick' ? cleanTitle : draft.title).trim(),
        courseId: courseId || null,
        kind,
        due: due.toISOString(),
        weight,
        estimateMin: draft.estimateMin ? Number(draft.estimateMin) : undefined,
        notes: draft.notes.trim() || undefined,
      })
      createdId = created.id
      createdTitle = created.title
      for (const title of draft.steps) s.addSubtask(created.id, { title })
      if (draft.addToToday) s.addToToday(created.id)
    })
    if (!createdId) return
    const assignmentId = createdId

    if (andAnother) {

      touched.current = { course: false, dueDate: false, dueTime: false, kind: false }
      setDraft({ ...emptyDraft(new Date(), courseId), addToToday: draft.addToToday })
      setApplied(false)
      setNewCourseCode(null)
      toast(`${createdTitle} added`, { action: { label: 'Undo', run: () => store.undo() } })
    } else {
      onClose()
      toast(`${createdTitle} added`, {
        action: { label: 'Undo', run: () => store.undo() },
        secondaryAction: { label: 'Open', run: () => onCreated(assignmentId) },
      })
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2.5">
          New task
          <Segmented
            size="sm"
            ariaLabel="How much of the form to show"
            value={mode}
            onChange={(v) => store.updateSettings({ addMode: v })}
            options={[
              { value: 'quick', label: 'Quick', title: 'Name, course, due date' },
              { value: 'detailed', label: 'Detailed', title: 'Every field' },
            ]}
          />
        </span>
      }
      size="lg"
      footer={
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button size="sm" onClick={() => submit(true)} disabled={!valid} title="Add and keep the form open">
            Add another
          </Button>
          <Button size="sm" variant="primary" onClick={() => submit(false)} disabled={!valid}>
            {mode === 'quick' ? <Zap size={14} /> : <Check size={14} />}
            Add task
          </Button>
        </div>
      }
    >
      {mode === 'quick' ? (
        <QuickAddPane
          value={{ title: draft.title, courseId: draft.courseId, date: draft.date, newCourseCode }}
          courses={courses}
          now={now}
          cleanTitle={cleanTitle}
          dueLabel={fmtDay(new Date(`${draft.date}T${draft.time || '23:59'}`))}
          error={quickParseError}
          detected={detected}
          onApplyDetected={applyDetected}
          onChange={(patch) => {
            if ('courseId' in patch || 'newCourseCode' in patch) touched.current.course = true
            if (patch.newCourseCode !== undefined) setNewCourseCode(patch.newCourseCode)
            if (patch.date !== undefined) updateDate(patch.date, patch.courseId ?? draft.courseId)
            setDraft((d) => ({
              ...d,
              ...(patch.title !== undefined ? { title: patch.title } : {}),
              ...(patch.courseId !== undefined ? { courseId: patch.courseId } : {}),
            }))
          }}
          onSubmit={() => submit(false)}
        />
      ) : (
      <div className="flex flex-col gap-4">
        <Field label="Task name">
          <Input
            data-autofocus
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="Assignment 3: graphs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) {
                e.preventDefault()
                submit(false)
              }
            }}
          />
        </Field>

        {detected && (
          <button
            type="button"
            onClick={applyDetected}
            className="-mt-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-tint hover:bg-tint-2 transition-colors text-left"
          >
            <Sparkles size={14} className="shrink-0 text-ink-3" />
            <span className="text-[12.5px] text-ink-2 flex-1 leading-snug">
              Read that as <span className="text-ink font-medium">{detected.bits.join(' · ')}</span>
            </span>
            <span className="text-[12.5px] font-semibold text-ink shrink-0">Use it</span>
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Course" className="col-span-2 sm:col-span-1">
            <Select
              value={draft.courseId}
              onChange={(e) => {
                touched.current.course = true
                set('courseId', e.target.value)
              }}
            >
              <option value="">No course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                  {c.title ? `: ${c.title}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Work type" className="col-span-2 sm:col-span-1">
            <Select
              value={draft.kind}
              onChange={(e) => {
                const kind = e.target.value as TaskKind
                touched.current.kind = true
                setDraft((d) => ({
                  ...d,
                  kind,
                  weight: !carriesWeight(kind) ? '' : d.weight === '' ? String(defaultWeight(kind)) : d.weight,
                }))
              }}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Due date" className="col-span-1">
            <Input type="date" value={draft.date} onChange={(e) => updateDate(e.target.value)} />
          </Field>
          <Field label="Due time" className="col-span-1">
            <Input type="time" value={draft.time} onChange={(e) => updateTime(e.target.value)} />
          </Field>

          <Field label="Worth (% of grade)" className="col-span-1">
            <Input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={draft.weight}
              placeholder="—"
              onChange={(e) => set('weight', e.target.value)}
            />
          </Field>
          <Field label="Estimated time" className="col-span-1">
            <Select value={draft.estimateMin} onChange={(e) => set('estimateMin', e.target.value)}>
              <option value="">Estimate for me</option>
              {ESTIMATES.map((m) => (
                <option key={m} value={m}>
                  {fmtDuration(m, { long: true })}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Prompt, sources, or notes (optional)"
            className="min-h-20"
          />
        </Field>

        <div>
          <p className="text-[12.5px] font-medium text-ink-2 mb-1.5">Steps (optional)</p>
          {draft.steps.length > 0 && (
            <ul className="flex flex-col gap-1 mb-1.5">
              {draft.steps.map((st, i) => (
                <li key={i} className="flex items-center gap-2 text-[13px] text-ink-2">
                  <span className="h-[15px] w-[15px] rounded-[4px] border-[1.5px] border-line-2 shrink-0" aria-hidden />
                  <span className="flex-1">{st}</span>
                  <button
                    type="button"
                    aria-label={`Remove step ${st}`}
                    onClick={() => set('steps', draft.steps.filter((_, j) => j !== i))}
                    className="text-ink-3 hover:text-ink transition-colors p-0.5"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5">
            <Input
              value={stepText}
              onChange={(e) => setStepText(e.target.value)}
              placeholder="Break it into steps…"
              aria-label="Add a step"
              className="h-9 text-[13px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (!stepText.trim()) return
                  set('steps', [...draft.steps, stepText.trim()])
                  setStepText('')
                }
              }}
            />
            <Button
              size="sm"
              variant="quiet"
              disabled={!stepText.trim()}
              onClick={() => {
                set('steps', [...draft.steps, stepText.trim()])
                setStepText('')
              }}
              aria-label="Add step"
            >
              <Plus size={15} />
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <button
            type="button"
            role="checkbox"
            aria-checked={draft.addToToday}
            onClick={() => set('addToToday', !draft.addToToday)}
            className={cx(
              'h-[18px] w-[18px] rounded-[5px] border-[1.5px] grid place-items-center transition-all shrink-0',
              draft.addToToday
                ? 'bg-invert-bg border-invert-bg text-invert-ink'
                : 'border-line-2 text-transparent hover:border-ink',
            )}
          >
            <Check size={12} strokeWidth={3} />
          </button>
          <span className="text-[13.5px] text-ink-2">Add to Today</span>
          {draft.courseId && (
            <CourseDot course={courses.find((c) => c.id === draft.courseId)} size={14} className="ml-auto" />
          )}
        </label>
      </div>
      )}
    </Sheet>
  )
}
