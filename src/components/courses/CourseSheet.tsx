import { useMemo, useState } from 'react'
import { Archive, ArchiveRestore, ClipboardCheck, Plus, Trash2 } from 'lucide-react'
import type { ColorSlot, Course, CourseExam } from '../../lib/types'
import { useStore } from '../../lib/store'
import { knownBuildings } from '../../lib/meetings'
import { courseColor } from '../../lib/theme'
import { uid } from '../../lib/id'
import { Button, ConfirmDialog, Field, Input, Sheet } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import { ClassTimesEditor } from './ClassTimesEditor'

const SLOTS: ColorSlot[] = [1, 2, 3, 4, 5, 6, 7, 8]
type CourseDraft = Omit<Course, 'id' | 'createdAt'> & { exams: CourseExam[] }

const examEventFields = (exam: CourseExam, courseId: string) => {
  const start = new Date(`${exam.date}T${exam.startTime || '09:00'}:00`)
  const end = new Date(`${exam.date}T${exam.endTime || '12:00'}:00`)
  if (Number.isNaN(+start) || Number.isNaN(+end)) return null
  return {
    title: exam.title.trim() || 'Exam',
    kind: 'exam' as const,
    start: start.toISOString(),
    end: (end > start ? end : new Date(+start + 3 * 60 * 60_000)).toISOString(),
    allDay: false,
    courseId,
    room: exam.room?.trim() || undefined,
    weight: exam.weight,
  }
}

export function CourseSheet({
  course,
  onClose,
}: {
  course: Course | null
  onClose: () => void
}) {
  const store = useStore()
  const courses = useStore((s) => s.courses)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const courseId = course?.id
  const courseExams = useMemo(
    () => (courseId ? plannerEvents.filter((event) => event.kind === 'exam' && event.courseId === courseId) : []),
    [plannerEvents, courseId],
  )
  const { toast } = useToast()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [draft, setDraft] = useState<CourseDraft>(() => ({
    code: course?.code ?? '',
    title: course?.title ?? '',
    color:
      course?.color ??
      (SLOTS.find((s) => !courses.some((c) => c.color === s)) ?? ((courses.length % 8) + 1)) as ColorSlot,
    professor: course?.professor ?? '',
    room: course?.room ?? '',
    currentGrade: course?.currentGrade,
    targetGrade: course?.targetGrade ?? 85,
    meetings: course?.meetings ?? [],
    exams: courseExams.map((event) => {
      const start = new Date(event.start)
      const end = new Date(event.end)
      const pad = (n: number) => `${n}`.padStart(2, '0')
      return {
        id: event.id,
        title: event.title,
        date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
        endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
        room: event.room,
        weight: event.weight,
      }
    }),
  }))

  const set = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) => setDraft((d) => ({ ...d, [k]: v }))

  const valid = draft.code.trim().length >= 2
  const buildings = useMemo(() => knownBuildings(courses), [courses])

  const addExam = () => {
    const pad = (n: number) => `${n}`.padStart(2, '0')
    const d = new Date()
    d.setDate(d.getDate() + 28)
    const dStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const existing = draft.exams ?? []
    const newExam: CourseExam = {
      id: uid(),
      title: existing.length === 0 ? 'Midterm' : 'Final Exam',
      date: dStr,
      startTime: '09:00',
      endTime: '12:00',
      room: draft.room?.trim() || '',
    }
    set('exams', [...existing, newExam])
  }

  const updateExam = (id: string, patch: Partial<CourseExam>) => {
    set(
      'exams',
      (draft.exams ?? []).map((e) => (e.id === id ? { ...e, ...patch } : e)),
    )
  }

  const removeExam = (id: string) => {
    set(
      'exams',
      (draft.exams ?? []).filter((e) => e.id !== id),
    )
  }

  const save = () => {
    if (!valid) return
    const { exams, ...courseDraft } = draft
    const existingById = new Map(courseExams.map((event) => [event.id, event]))
    const draftIds = new Set(exams.map((exam) => exam.id))
    let savedCourseId: string | null = course?.id ?? null
    let savedCourseCode = course?.code ?? draft.code
    store.batch(course ? 'Updated course' : `Added ${draft.code.trim().toUpperCase()}`, (s) => {
      if (course) {
        s.updateCourse(course.id, courseDraft)
        savedCourseCode = courseDraft.code
      } else {
        const savedCourse = s.addCourse({ ...courseDraft, code: draft.code })
        savedCourseId = savedCourse.id
        savedCourseCode = savedCourse.code
      }
      if (!savedCourseId) return
      for (const exam of exams) {
        const fields = examEventFields(exam, savedCourseId)
        if (!fields) continue
        if (existingById.has(exam.id)) s.updatePlannerEvent(exam.id, fields)
        else s.addPlannerEvent(fields)
      }
      for (const event of courseExams) {
        if (!draftIds.has(event.id)) s.removePlannerEvent(event.id)
      }
    })
    toast(course ? 'Course updated' : `${savedCourseCode} added`, {
      action: { label: 'Undo', run: () => store.undo() },
    })
    onClose()
  }

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={course ? `Edit ${course.code}` : 'Add a course'}
        size="lg"
        footer={
          <div className="flex items-center gap-2">
            {course && (
              <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} aria-label="Delete course">
                <Trash2 size={14} />
              </Button>
            )}
            {course && (
              <Button
                size="sm"
                onClick={() => {
                  const next = !course.archived
                  store.setCourseArchived(course.id, next)
                  toast(next ? `${course.code} archived` : `${course.code} restored`, {
                    action: { label: 'Undo', run: () => store.undo() },
                  })
                  onClose()
                }}
              >
                {course.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                {course.archived ? 'Restore' : 'Archive'}
              </Button>
            )}
            <div className="flex-1" />
            <Button size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={!valid}>
              {course ? 'Save' : 'Add course'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Course code" className="col-span-2 sm:col-span-1">
              <Input
                data-autofocus
                value={draft.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="COMP 250"
                autoCapitalize="characters"
                spellCheck={false}
                onKeyDown={(e) => e.key === 'Enter' && valid && save()}
              />
            </Field>
            <Field label="Title (optional)" className="col-span-2 sm:col-span-1">
              <Input
                value={draft.title ?? ''}
                onChange={(e) => set('title', e.target.value)}
                placeholder="Intro to Computer Science"
              />
            </Field>
          </div>

          <Field group label="Colour">
            <div className="flex items-start gap-1.5 flex-wrap">
              {SLOTS.map((s) => {
                const owner = courses.find((c) => c.color === s && c.id !== course?.id)
                const selected = draft.color === s
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('color', s)}
                    aria-label={owner ? `Colour ${s}, already used by ${owner.code}` : `Colour ${s}, free`}
                    aria-pressed={selected}
                    title={owner ? `Already used by ${owner.code}` : undefined}
                    className="w-[52px] flex flex-col items-center gap-1 group/sw"
                  >
                    <span
                      className={cx(
                        'h-8 w-8 rounded-full transition-all duration-150',
                        'group-hover/sw:scale-110 group-active/sw:scale-95',
                        selected && 'ring-2 ring-ink ring-offset-2 ring-offset-surface',
                      )}
                      style={{ background: courseColor(s), opacity: owner && !selected ? 0.4 : 1 }}
                    />
                    <span
                      aria-hidden
                      className={cx(
                        'h-[11px] text-[9.5px] leading-[11px] font-medium tracking-tight w-full text-center truncate',
                        owner ? 'text-ink-3' : 'text-transparent',
                      )}
                    >
                      {owner ? owner.code.split(' ')[0] : '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Professor" className="col-span-2 sm:col-span-1">
              <Input
                value={draft.professor ?? ''}
                onChange={(e) => set('professor', e.target.value)}
                placeholder="Prof. Alberini"
              />
            </Field>

            <Field label="Usual room" className="col-span-2 sm:col-span-1">
              <Input value={draft.room ?? ''} onChange={(e) => set('room', e.target.value)} placeholder="Leacock 132" />
            </Field>
            <Field label="Current grade (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.currentGrade ?? ''}
                placeholder="—"
                onChange={(e) => set('currentGrade', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </Field>
            <Field label="Target grade (%)">
              <Input
                type="number"
                min={0}
                max={100}
                value={draft.targetGrade ?? ''}
                onChange={(e) => set('targetGrade', e.target.value === '' ? undefined : Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="border-t border-line pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-ink flex items-center gap-1.5">
                <ClipboardCheck size={15} className="text-ink-3" />
                Exams
              </span>
              <Button size="sm" type="button" onClick={addExam}>
                <Plus size={13} />
                Add exam
              </Button>
            </div>

            {(!draft.exams || draft.exams.length === 0) ? (
              <p className="text-[12px] text-ink-3 py-1">No exams scheduled for this course.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {draft.exams.map((exam) => (
                  <div
                    key={exam.id}
                    className="rounded-xl border border-line bg-surface-2 p-2.5 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={exam.title}
                        onChange={(e) => updateExam(exam.id, { title: e.target.value })}
                        placeholder="Exam title"
                        className="flex-1 h-8 text-[13px] font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => removeExam(exam.id)}
                        aria-label="Remove exam"
                        className="text-ink-3 hover:text-ink p-1 rounded-md hover:bg-tint transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <Field label="Date">
                        <Input
                          type="date"
                          value={exam.date}
                          onChange={(e) => updateExam(exam.id, { date: e.target.value })}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Starts">
                        <Input
                          type="time"
                          step={900}
                          value={exam.startTime}
                          onChange={(e) => updateExam(exam.id, { startTime: e.target.value })}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Ends">
                        <Input
                          type="time"
                          step={900}
                          value={exam.endTime}
                          onChange={(e) => updateExam(exam.id, { endTime: e.target.value })}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Room (optional)">
                        <Input
                          value={exam.room ?? ''}
                          onChange={(e) => updateExam(exam.id, { room: e.target.value || undefined })}
                          placeholder={draft.room || 'Location'}
                          className="h-8 text-[12px]"
                        />
                      </Field>
                      <Field label="Weight (%)">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={exam.weight ?? ''}
                          onChange={(e) =>
                            updateExam(exam.id, {
                              weight: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          placeholder="—"
                          className="h-8 text-[12px]"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ClassTimesEditor
            meetings={draft.meetings}
            onChange={(meetings) => set('meetings', meetings)}
            buildings={buildings}
            defaultRoom={draft.room?.trim() || undefined}
          />
        </div>
      </Sheet>

      {course && (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            store.removeCourse(course.id)
            onClose()
            toast(`${course.code} deleted`, { action: { label: 'Undo', run: () => store.undo() } })
          }}
          title={`Delete ${course.code}?`}
          body="Its tasks and study blocks go too. You can undo this straight away."
        />
      )}
    </>
  )
}
