import { createElement, useEffect, useMemo, useState } from 'react'
import { BookOpen, Calendar, Check, Coffee, Copy, Play, School, Trash2 } from 'lucide-react'
import type { Assignment, BlockKind, Course, StudyBlock } from '../../lib/types'
import { atMinutes, fmtDuration, fmtTime, minutesOfDay, startOfDay } from '../../lib/date'
import { stepOf } from '../../lib/steps'
import { subjectIcon } from '../../lib/subjectIcon'
import { blockDisplay, isDefaultBlockTitle } from '../../lib/scheduleDisplay'
import { Button, CourseDot, Field, Input, Segmented, Select, Sheet } from '../ui'
import { cx } from '../../lib/ui'
import { SegmentBar, SegmentRows } from '../schedule/SessionPlan'

export interface BlockSheetProps {
  block: StudyBlock
  courses: Course[]
  assignments: Assignment[]
  onClose: () => void
  onPatch: (patch: Partial<StudyBlock>) => void
  onReschedule: (startMs: number, endMs: number) => void
  onDuplicate: () => void
  onDelete: () => void
  onToggleDone: () => void
  onFocus: () => void
}

const QUICK = [15, 25, 45, 60, 90, 120]
const DURATIONS = [15, 25, 30, 45, 60, 75, 90, 120, 150, 180, 240]

const toDateInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const toTimeInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function BlockSheet(p: BlockSheetProps) {
  const { block, courses, assignments, onClose } = p
  const [confirmDelete, setConfirmDelete] = useState(false)

  const kind: BlockKind = block.kind ?? 'study'
  const isFree = kind === 'free'
  const isAppointment = kind === 'appointment'
  const isOneOffClass = kind === 'one_off_class'
  const isStudy = !isFree && !isAppointment && !isOneOffClass

  const editableTitle = isDefaultBlockTitle(kind, block.title) ? '' : (block.title ?? '')
  const [titleDraft, setTitleDraft] = useState(editableTitle)
  const startMs = +new Date(block.start)
  const endMs = +new Date(block.end)
  const minutes = Math.round((endMs - startMs) / 60_000)

  const openTasks = useMemo(() => {
    const byCourse = new Map<string, Assignment[]>()
    for (const a of assignments) {
      if (a.status === 'done' || a.archived) continue
      const k = a.courseId ?? '__none__'
      byCourse.set(k, [...(byCourse.get(k) ?? []), a])
    }
    return byCourse
  }, [assignments])

  const activeAssignment = isStudy && block.assignmentId ? assignments.find((a) => a.id === block.assignmentId) : undefined
  const resolvedCourseId = isFree
    ? undefined
    : (block.courseId ?? (isStudy ? activeAssignment?.courseId : undefined))
  const activeCourse = resolvedCourseId ? courses.find((c) => c.id === resolvedCourseId) : undefined
  const activeStep = isStudy ? stepOf(block, activeAssignment) : undefined
  const stepNo = activeStep && activeAssignment ? activeAssignment.subtasks.indexOf(activeStep) + 1 : 0

  const activeLocation = (isAppointment || isOneOffClass) ? block.location : undefined
  const activeCourseCode = isOneOffClass && !activeCourse ? block.courseCode : undefined
  const activePlan = isStudy ? block.plan : undefined

  const display = blockDisplay({
    block: { ...block, kind },
    course: activeCourse,
    assignment: activeAssignment,
    stepTitle: activeStep?.title,
  })
  const { title } = display
  const oneOffIcon = activeCourseCode?.trim() ? subjectIcon(activeCourseCode) : School

  useEffect(() => {
    setTitleDraft(editableTitle)
  }, [block.id, kind, editableTitle])

  const setDuration = (mins: number) => p.onReschedule(startMs, startMs + mins * 60_000)

  const setDay = (value: string) => {
    if (!value) return
    const [y, m, d] = value.split('-').map(Number)
    const nextDay = new Date(y, m - 1, d)
    const next = +atMinutes(nextDay, minutesOfDay(startMs))
    p.onReschedule(next, next + minutes * 60_000)
  }

  const setStartTime = (value: string) => {
    if (!value) return
    const [h, mi] = value.split(':').map(Number)
    const next = +atMinutes(startOfDay(startMs), h * 60 + mi)
    p.onReschedule(next, next + minutes * 60_000)
  }

  const handleKindChange = (nextKind: BlockKind) => {
    if (nextKind === kind) return
    p.onPatch({ kind: nextKind })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {activeCourse ? (
            <CourseDot course={activeCourse} size={16} />
          ) : activeCourseCode?.trim() ? (
            createElement(oneOffIcon, { size: 16, className: 'text-ink-2 shrink-0', 'aria-hidden': true })
          ) : isFree ? (
            <Coffee size={16} className="text-ink-2 shrink-0" />
          ) : isAppointment ? (
            <Calendar size={16} className="text-ink-2 shrink-0" />
          ) : isOneOffClass ? (
            <School size={16} className="text-ink-2 shrink-0" />
          ) : (
            <BookOpen size={16} className="text-ink-2 shrink-0" />
          )}
          <span className="truncate">{title}</span>
        </span>
      }
      description={
        <>
          {fmtTime(startMs)} – {fmtTime(endMs)} · {fmtDuration(minutes)}
          {isFree && ' · Protected downtime'}
          {isAppointment && activeLocation && ` · ${activeLocation}`}
          {isOneOffClass && activeLocation && ` · ${activeLocation}`}
          {isStudy && activeStep && activeAssignment && (
            <>
              {' · '}
              <span className="text-ink-3">
                step {stepNo} of {activeAssignment.subtasks.length}
              </span>{' '}
              of {activeAssignment.title}
            </>
          )}
        </>
      }
      footer={
        confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-2 flex-1">Delete this block?</span>
            <Button size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="danger" onClick={p.onDelete} data-autofocus>
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete block"
              className="px-2.5"
            >
              <Trash2 size={14} />
            </Button>
            <Button size="sm" onClick={p.onDuplicate}>
              <Copy size={13} />
              Duplicate
            </Button>
            <div className="flex-1" />
            {isStudy && !block.done && (
              <Button size="sm" onClick={p.onFocus}>
                <Play size={13} />
                Focus
              </Button>
            )}
            {isStudy && (
              <Button size="sm" variant="secondary" onClick={p.onToggleDone}>
                <Check size={14} />
                {block.done ? 'Mark incomplete' : 'Mark completed'}
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={onClose}>
              Done editing
            </Button>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          size="sm"
          ariaLabel="Block type"
          value={kind}
          onChange={(v) => handleKindChange(v as BlockKind)}
          options={[
            { value: 'study', label: 'Study' },
            { value: 'free', label: 'Free time' },
            { value: 'appointment', label: 'Appointment' },
            { value: 'one_off_class', label: 'One-off class' },
          ]}
          className="w-full [&>button]:flex-1"
        />

        {isFree && (
          <>
            <Field label="Label">
              <Input
                data-autofocus
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value)
                  p.onPatch({ title: e.target.value || undefined })
                }}
                placeholder="Free time (or e.g. Gym, Dinner, Rest)"
              />
            </Field>
            <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
              Protected downtime · Nudge will never schedule study time here.
            </div>
          </>
        )}

        {isAppointment && (
          <>
            <Field label="Title">
              <Input
                data-autofocus
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value)
                  p.onPatch({ title: e.target.value || undefined })
                }}
                placeholder="Appointment (or e.g. Doctor, Dentist, Meeting)"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Location (optional)" className="col-span-2 sm:col-span-1">
                <Input
                  value={block.location ?? ''}
                  onChange={(e) => p.onPatch({ location: e.target.value || undefined })}
                  placeholder="e.g. Clinic, Room 302, Zoom"
                />
              </Field>
              <Field label="Course (optional)" className="col-span-2 sm:col-span-1">
                <Select
                  value={block.courseId ?? ''}
                  onChange={(e) => p.onPatch({ courseId: e.target.value || null })}
                >
                  <option value="">Not course-related</option>
                  {courses
                    .filter((c) => !c.archived)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                </Select>
              </Field>
            </div>
          </>
        )}

        {isOneOffClass && (
          <>
            <Field label="Class name">
              <Input
                data-autofocus
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value)
                  p.onPatch({ title: e.target.value || undefined })
                }}
                placeholder="e.g. Extra math tutorial"
              />
            </Field>
            <Field label="Course (optional)">
              <Select
                value={block.courseId ?? '__new__'}
                onChange={(e) => {
                  const value = e.target.value
                  p.onPatch({
                    courseId: value === '__new__' ? null : value,
                    courseCode: value === '__new__' ? block.courseCode : undefined,
                  })
                }}
              >
                <option value="__new__">New / not in schedule</option>
                {courses
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}{c.title ? ` · ${c.title}` : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            {!activeCourse && (
              <Field label="Course code (optional)">
                <Input
                  value={block.courseCode ?? ''}
                  onChange={(e) => p.onPatch({ courseCode: e.target.value || undefined })}
                  onBlur={(e) => p.onPatch({ courseCode: e.target.value.trim().toUpperCase() || undefined })}
                  placeholder="e.g. MATH 240"
                />
                <p className="mt-1.5 text-[11.5px] text-ink-3">
                  Add a code to use the matching subject icon. Leave it blank for a generic one-off class icon.
                </p>
              </Field>
            )}
            <Field label="Location (optional)">
              <Input
                value={block.location ?? ''}
                onChange={(e) => p.onPatch({ location: e.target.value || undefined })}
                placeholder="e.g. Room 302, Zoom"
              />
            </Field>
          </>
        )}

        {isStudy && (
          <>
            <Field label="What is this for?">
              <Select
                value={block.assignmentId ?? (block.courseId ? `c:${block.courseId}` : '')}
                onChange={(e) => {
                  const v = e.target.value
                  if (!v) p.onPatch({ assignmentId: null, courseId: null, subtaskId: null })
                  else if (v.startsWith('c:')) p.onPatch({ assignmentId: null, courseId: v.slice(2), subtaskId: null })
                  else {
                    const a = assignments.find((x) => x.id === v)
                    p.onPatch({ assignmentId: v, courseId: a?.courseId ?? null, subtaskId: null })
                  }
                }}
              >
                <option value="">General study</option>
                {courses
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <optgroup key={c.id} label={c.code}>
                      <option value={`c:${c.id}`}>{c.code}: general</option>
                      {(openTasks.get(c.id) ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                {(openTasks.get('__none__') ?? []).length > 0 && (
                  <optgroup label="No course">
                    {(openTasks.get('__none__') ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            </Field>

            {activeAssignment && activeAssignment.subtasks.length > 0 && (
              <Field label="Which step?">
                <Select
                  value={block.subtaskId ?? ''}
                  onChange={(e) => p.onPatch({ subtaskId: e.target.value || null })}
                >
                  <option value="">No particular step</option>
                  {activeAssignment.subtasks.map((s, i) => (
                    <option key={s.id} value={s.id}>
                      {i + 1}. {s.title}
                      {s.done ? ' ✓' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Label (optional)">
              <Input
                value={titleDraft}
                onChange={(e) => {
                  setTitleDraft(e.target.value)
                  p.onPatch({ title: e.target.value || undefined })
                }}
                placeholder={activeStep?.title ?? activeAssignment?.title ?? activeCourse?.code ?? 'Study'}
              />
            </Field>

            {activePlan && activePlan.length > 0 && (
              <Field group label="Session plan">
                <SegmentBar segments={activePlan} className="mb-2" />
                <SegmentRows segments={activePlan} />
                <button
                  type="button"
                  onClick={() => p.onPatch({ plan: undefined })}
                  className="mt-2 text-[12px] text-ink-3 hover:text-ink transition-colors"
                >
                  Clear plan
                </button>
              </Field>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-line">
          <Field label="Day">
            <Input type="date" value={toDateInput(block.start)} onChange={(e) => setDay(e.target.value)} />
          </Field>
          <Field label="Starts">
            <Input
              type="time"
              step={900}
              value={toTimeInput(block.start)}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </Field>
        </div>

        <Field group label="Duration">
          <div className="flex items-center gap-1.5 flex-wrap">
            {QUICK.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d)}
                aria-pressed={minutes === d}
                className={cx(
                  'h-9 px-3 rounded-[10px] text-[13px] font-medium tnum transition-colors',
                  minutes === d ? 'bg-invert-bg text-invert-ink' : 'bg-tint text-ink-2 hover:bg-tint-2',
                )}
              >
                {d < 60 ? `${d}m` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`}
              </button>
            ))}
            <Select
              aria-label="Other duration"
              value={DURATIONS.includes(minutes) ? String(minutes) : 'custom'}
              onChange={(e) => e.target.value !== 'custom' && setDuration(Number(e.target.value))}
              className="h-9 w-[112px] text-[13px]"
            >
              {!DURATIONS.includes(minutes) && <option value="custom">{fmtDuration(minutes)}</option>}
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {fmtDuration(d, { long: true })}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </div>
    </Sheet>
  )
}
