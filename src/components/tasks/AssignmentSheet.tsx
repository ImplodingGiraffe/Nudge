import { useEffect, useMemo, useState } from 'react'
import { Check, Clock, ListPlus, Lock, Play, Plus, Sparkles, StickyNote, Trash2, X } from 'lucide-react'
import type { Assignment, TaskKind } from '../../lib/types'
import { useStore } from '../../lib/store'
import { KIND_LABEL, defaultEffort, hasPlaybook, proposeBreakdown, remainingEffort } from '../../lib/priority'
import { fmtDue, fmtDuration, fmtTimeRange } from '../../lib/date'
import { blockOf, splitSummary } from '../../lib/steps'
import { realDue } from '../../lib/workEngine'
import { dayWord } from '../../lib/sessionPlan'
import type { Derived } from '../../lib/derive'
import { useAiConfig } from '../../lib/ai/useAiConfig'
import { InlineAi } from '../ai/InlineAi'
import { NoteComposer, NoteItem } from '../today/FocusNotes'
import { Button, Chip, ConfirmDialog, CourseDot, Field, InlineEdit, Input, Segmented, Select, Sheet, Switch, Textarea } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'

const toLocalInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const KINDS = Object.keys(KIND_LABEL) as TaskKind[]

export function AssignmentSheet({
  assignment,
  onClose,
  onStartFocus,
  loggedMin,
  calibrationFactor,
  derived,
  now,
}: {
  assignment: Assignment
  onClose: () => void
  onStartFocus: (assignmentId: string, courseId: string | null) => void
  loggedMin: number
  calibrationFactor: number
  derived: Derived
  now: number
}) {
  const store = useStore()
  const courses = useStore((s) => s.courses)
  const { toast } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newStep, setNewStep] = useState('')
  const [showAll, setShowAll] = useState(false)
  const aiConfig = useAiConfig()

  const a = useStore((s) => s.assignments.find((x) => x.id === assignment.id)) ?? assignment
  const blocks = useStore((s) => s.blocks)
  const onToday = useStore((s) => s.todayList.some((t) => t.assignmentId === assignment.id))
  const course = courses.find((c) => c.id === a.courseId)
  const due = realDue(a.due, a.createdAt)
  const remaining = remainingEffort(a, loggedMin, { factor: calibrationFactor, samples: 3, byKind: {} })

  const preview = useMemo(() => proposeBreakdown(a, a.estimateMin ?? defaultEffort(a)), [a])
  const doneSteps = a.subtasks.filter((s) => s.done).length

  const allNotes = useStore((s) => s.focusNotes)
  const taskNotes = useMemo(() => allNotes.filter((n) => n.assignmentId === a.id), [allNotes, a.id])

  useEffect(() => {
    if (a.subtasks.length > 3) {
      setShowAll(false)
    }
  }, [a.subtasks.length])

  const patch = (p: Partial<Assignment>) => store.updateAssignment(a.id, p)

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            {course && <CourseDot course={course} size={16} />}
            <InlineEdit
              value={a.title}
              onCommit={(title) => {
                patch({ title })
                toast('Task name updated', { action: { label: 'Undo', run: () => store.undo() } })
              }}
              ariaLabel={`Edit task name: ${a.title}`}
              disableFocusRing
              className="flex-1 min-w-0 truncate text-left"
            />
          </span>
        }
        description={`${course?.code ? `${course.code} · ` : ''}${KIND_LABEL[a.kind]}${due ? ` · ${fmtDue(due)}` : ''}`}
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete task"
              className="px-2.5"
            >
              <Trash2 size={14} />
            </Button>
            <div className="flex-1" />
            {a.status !== 'done' && (
              <Button
                size="sm"
                onClick={() => {
                  onStartFocus(a.id, a.courseId)
                  onClose()
                }}
              >
                <Play size={13} />
                Focus
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const nextStatus = a.status === 'done' ? 'todo' : 'done'
                store.setAssignmentStatus(a.id, nextStatus)
                  if (nextStatus === 'done') {
                    toast('Task completed', { tone: 'good', action: { label: 'Undo', run: () => store.undo() } })
                  onClose()
                  } else {
                    toast('Task reopened', { action: { label: 'Undo', run: () => store.undo() } })
                }
              }}
            >
              <Check size={14} />
              {a.status === 'done' ? 'Mark incomplete' : 'Mark completed'}
            </Button>
            <Button variant="primary" size="sm" onClick={onClose}>
              Done editing
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              ariaLabel="Status"
              value={a.status}
              onChange={(v) => {
                store.setAssignmentStatus(a.id, v)
                toast(v === 'done' ? 'Task completed' : 'Task status updated', {
                  action: { label: 'Undo', run: () => store.undo() },
                })
              }}
              options={[
                { value: 'todo', label: 'Not started' },
                { value: 'doing', label: 'In progress' },
                { value: 'done', label: 'Completed' },
              ]}
            />
            {loggedMin > 0 && (
              <Chip>
                <Clock size={11} />
                {fmtDuration(loggedMin)} logged
              </Chip>
            )}
            {a.status !== 'done' && <Chip tone="quiet">{fmtDuration(remaining)} left</Chip>}
            {a.status !== 'done' && (
              <Button
                size="sm"
                variant={onToday ? 'primary' : 'secondary'}
                onClick={() => {
                  if (onToday) {
                    store.removeFromToday(a.id)
                    toast('Taken off today', { action: { label: 'Undo', run: () => store.undo() } })
                  } else {
                    store.addToToday(a.id)
                    toast('Added to today', { action: { label: 'Undo', run: () => store.undo() } })
                  }
                }}
                className="ml-auto"
              >
                <ListPlus size={14} />
                {onToday ? 'On today' : 'Do today'}
              </Button>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <h3 className="text-[13px] font-semibold text-ink">
                Steps{' '}
                {a.subtasks.length > 0 && (
                  <span className="text-ink-3 font-normal tnum">
                    {doneSteps}/{a.subtasks.length}
                  </span>
                )}
              </h3>
              {a.subtasks.length === 0 && !aiConfig.available && (
                <Button
                  size="xs"
                  variant="quiet"
                  onClick={() => {
                    const made = store.applyBreakdown(a.id, a.estimateMin ?? defaultEffort(a))
                    toast(splitSummary(made.steps, made.blocks, made.replaced), {
                      action: { label: 'Undo', run: () => store.undo() },
                    })
                  }}
                >
                  <Sparkles size={12} />
                  Break it down
                </Button>
              )}
            </div>

            {a.subtasks.length === 0 ? (
              aiConfig.available ? (
                <div className="mb-2 flex flex-col gap-2">
                  <InlineAi
                    derived={derived}
                    now={now}
                    surface="breakdown"
                    focusAssignmentId={a.id}
                    hint={`The task in front of them is "${a.title}"${course ? ` for ${course.code}` : ''}${due ? `, due ${fmtDue(due, now)}` : ''}, about ${fmtDuration(remaining)} of work left. Break down that task and nothing else.`}
                    label="Break it into steps"
                    icon={<Sparkles size={12} />}
                    size="sm"
                    variant="secondary"
                    className="self-start"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const made = store.applyBreakdown(a.id, a.estimateMin ?? defaultEffort(a))
                      toast(splitSummary(made.steps, made.blocks, made.replaced), {
                        action: { label: 'Undo', run: () => store.undo() },
                      })
                    }}
                    className="self-start text-[12px] text-ink-3 hover:text-ink transition-colors"
                  >
                    Use standard {hasPlaybook(a.kind) ? `${KIND_LABEL[a.kind].toLowerCase()} ` : ''}plan
                  </button>
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-3 leading-relaxed mb-2">
                  Suggested steps:{' '}
                  <span className="text-ink-2">{preview.map((s) => s.title).join(' · ')}</span>
                </p>
              )
            ) : (
              <ul className="flex flex-col mb-1">
                {(showAll ? a.subtasks : a.subtasks.slice(0, 6)).map((s) => {
                  const booked = blockOf(blocks, s.id)
                  return (
                    <li key={s.id} className="group flex items-start gap-2.5 py-1.5 rounded-lg hover:bg-tint px-1.5 -mx-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          store.updateSubtask(a.id, s.id, { done: !s.done })
                          toast(s.done ? 'Step reopened' : 'Step completed', {
                            action: { label: 'Undo', run: () => store.undo() },
                          })
                        }}
                        aria-label={`Mark ${s.title} ${s.done ? 'not done' : 'done'}`}
                        className={cx(
                          'mt-[2px] shrink-0 h-[17px] w-[17px] rounded-[5px] border-[1.5px] grid place-items-center transition-all hover:scale-110 active:scale-95',
                          s.done
                            ? 'bg-invert-bg border-invert-bg text-invert-ink'
                            : 'border-line-2 text-transparent hover:border-ink',
                        )}
                      >
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <InlineEdit
                        value={s.title}
                        onCommit={(title) => {
                          store.updateSubtask(a.id, s.id, { title })
                          toast('Step updated', { action: { label: 'Undo', run: () => store.undo() } })
                        }}
                        ariaLabel={`Edit step ${s.title}`}
                        className={cx(
                          'flex-1 min-w-0 text-[13.5px] leading-snug',
                          s.done ? 'text-ink-3 line-through' : 'text-ink',
                        )}
                      >
                        {s.title}
                        {s.estimateMin ? <span className="text-ink-3 tnum text-[11.5px]"> · {fmtDuration(s.estimateMin)}</span> : null}
                      </InlineEdit>
                      {!s.done &&
                        (booked ? (
                          <span className="text-[11px] text-ink-3 tnum shrink-0 pt-[3px]" title="Booked on the plan">
                            {dayWord(+new Date(booked.start), now)} {fmtTimeRange(booked.start, booked.end)}
                          </span>
                        ) : s.due ? (
                          <span className="text-[11px] text-ink-3 tnum shrink-0 pt-[3px]">{fmtDue(s.due)}</span>
                        ) : null)}
                      <button
                        type="button"
                        onClick={() => {
                          store.removeSubtask(a.id, s.id)
                          toast('Step removed', { action: { label: 'Undo', run: () => store.undo() } })
                        }}
                        aria-label={`Remove ${s.title}`}
                        className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-ink-3 hover:text-ink transition-opacity p-0.5"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  )
                })}
                {a.subtasks.length > 6 && !showAll && (
                  <button
                    className="text-[12.5px] text-ink-2 hover:text-ink underline underline-offset-2 self-start mt-1 ml-1"
                    onClick={() => setShowAll(true)}
                  >
                    Show {a.subtasks.length - 6} more
                  </button>
                )}
              </ul>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!newStep.trim()) return
                store.addSubtask(a.id, { title: newStep })
                setNewStep('')
                toast('Step added', { action: { label: 'Undo', run: () => store.undo() } })
              }}
              className="flex items-center gap-1.5"
            >
              <Input
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                placeholder="Add a step…"
                className="h-9 text-[13px]"
                aria-label="New step"
              />
              <Button type="submit" size="sm" variant="quiet" disabled={!newStep.trim()} aria-label="Add step">
                <Plus size={15} />
              </Button>
            </form>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Field label="Course" className="col-span-2 sm:col-span-1">
              <Select value={a.courseId ?? ''} onChange={(e) => patch({ courseId: e.target.value || null })}>
                <option value="">No course</option>
                {courses
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Work type" className="col-span-2 sm:col-span-1">
              <Select value={a.kind} onChange={(e) => patch({ kind: e.target.value as TaskKind })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due" className="col-span-2 sm:col-span-1">
              <Input
                type="datetime-local"
                value={due ? toLocalInput(due) : ''}
                onChange={(e) => e.target.value && patch({ due: new Date(e.target.value).toISOString() })}
              />
            </Field>
            <Field label="Weight (% of grade)" className="col-span-1">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={a.weight ?? ''}
                placeholder="—"
                onChange={(e) => patch({ weight: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </Field>
            <Field
              label="Your estimate"
              className="col-span-1"
              hint={
                calibrationFactor > 1.15 && a.estimateMin
                  ? `Planning for ${fmtDuration(a.estimateMin * calibrationFactor)}`
                  : undefined
              }
            >
              <Select
                value={String(a.estimateMin ?? '')}
                onChange={(e) => patch({ estimateMin: e.target.value ? Number(e.target.value) : undefined })}
              >
                <option value="">—</option>
                {[30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900].map((m) => (
                  <option key={m} value={m}>
                    {fmtDuration(m, { long: true })}
                  </option>
                ))}
              </Select>
            </Field>
            {a.status === 'done' && (
              <Field label="Grade received (%)" className="col-span-1">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={a.grade ?? ''}
                  placeholder="—"
                  onChange={(e) => patch({ grade: e.target.value === '' ? undefined : Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label="Notes" className="col-span-2">
              <Textarea
                value={a.notes ?? ''}
                onChange={(e) => patch({ notes: e.target.value || undefined })}
                placeholder="Add the prompt, required sources, or notes."
                className="min-h-16"
              />
            </Field>

            <section className="col-span-2 flex flex-col mt-1 pt-4 border-t border-line" aria-labelledby="task-notes-heading">
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 text-[var(--c-accent)] shrink-0">
                  <StickyNote size={17} strokeWidth={1.8} aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 id="task-notes-heading" className="text-[15px] font-semibold tracking-[-0.01em] text-ink truncate">
                    Study Notes
                  </h3>
                  <p className="mt-0.5 text-[12px] text-ink-3 truncate">
                    {course?.code ?? 'Linked to this task'}
                  </p>
                </div>
              </div>

              <div className="pt-3">
                <NoteComposer
                  compact
                  hideCourseSelector
                  hideSaveHint
                  initialCourseId={a.courseId ?? ''}
                  initialAssignmentId={a.id}
                  placeholder="Write a note…"
                  onSave={(text) => {
                    store.addFocusNote({ text, courseId: a.courseId ?? null, assignmentId: a.id })
                    toast('Note saved', { action: { label: 'Undo', run: () => store.undo() } })
                  }}
                />
              </div>

              <div className="pt-3">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <p className="text-[13px] font-semibold text-ink">Study Notes</p>
                  {taskNotes.length > 0 && <span className="text-[12px] text-ink-3 tnum">{taskNotes.length}</span>}
                </div>

                {taskNotes.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    {taskNotes.map((note) => (
                      <NoteItem key={note.id} note={note} comfortable />
                    ))}
                  </div>
                ) : (
                  <div className="mt-8 px-5 text-center">
                    <p className="text-[14px] font-medium text-ink-2">No notes yet</p>
                  </div>
                )}
              </div>
            </section>

            <div className="col-span-2 flex items-start justify-between gap-3 pt-1 border-t border-line">
              <div className="min-w-0">
                <p className="text-[13px] text-ink flex items-center gap-1.5">
                  {a.private && <Lock size={12} className="text-ink-3" aria-hidden />}
                  Keep this private
                </p>
                <p className="text-[11.5px] text-ink-3 leading-snug">
                  Exclude task details from AI planning prompts.
                </p>
              </div>
              <Switch checked={!!a.private} onChange={(v) => patch({ private: v })} label="Keep this task private" />
            </div>
          </div>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          store.removeAssignment(a.id)
          onClose()
          toast('Task deleted', { action: { label: 'Undo', run: () => store.undo() } })
        }}
        title={`Delete "${a.title}"?`}
        body="Its study blocks stay on your calendar, but they'll no longer be linked to anything. You can undo this."
      />
    </>
  )
}
