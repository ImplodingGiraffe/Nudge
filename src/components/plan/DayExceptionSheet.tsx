import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { PlannerEvent, ScheduleOverride } from '../../lib/types'
import { useStore } from '../../lib/store'
import { Button, Field, Input, Segmented, Select, Sheet } from '../ui'
import { useToast } from '../../lib/toast'
import { dayKey } from '../../lib/date'

export interface DayExceptionSheetProps {
  initialDate: string
  initialType?: ExceptionType
  existingEvent?: PlannerEvent | null
  existingOverride?: ScheduleOverride | null
  onClose: () => void
}

type ExceptionType = 'holiday' | 'break' | 'override' | 'exam'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const exceptionTypeLabel: Record<ExceptionType, string> = {
  holiday: 'Holiday',
  break: 'Break',
  override: 'Timetable switch',
  exam: 'Exam',
}

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

export function DayExceptionSheet({
  initialDate,
  initialType,
  existingEvent,
  existingOverride,
  onClose,
}: DayExceptionSheetProps) {
  const store = useStore()
  const courses = useStore((s) => s.courses)
  const { toast } = useToast()

  const [type, setType] = useState<ExceptionType>(() => {
    if (existingOverride) return 'override'
    if (existingEvent?.kind === 'exam') return 'exam'
    if (existingEvent?.kind === 'reading_break') return 'break'
    return initialType ?? 'holiday'
  })

  const [holidayTitle, setHolidayTitle] = useState(
    existingEvent && existingEvent.kind === 'holiday' ? existingEvent.title : 'Holiday',
  )
  const [holidayDate, setHolidayDate] = useState(
    existingEvent ? dayKey(existingEvent.start) : initialDate,
  )

  const [breakTitle, setBreakTitle] = useState(
    existingEvent && existingEvent.kind === 'reading_break' ? existingEvent.title : 'Reading break',
  )
  const [breakStart, setBreakStart] = useState(
    existingEvent ? dayKey(existingEvent.start) : initialDate,
  )
  const [breakEnd, setBreakEnd] = useState(
    existingEvent ? dayKey(existingEvent.end) : initialDate,
  )

  const [examTitle, setExamTitle] = useState(
    existingEvent?.kind === 'exam' ? existingEvent.title : 'Exam',
  )
  const [examCourseId, setExamCourseId] = useState(
    existingEvent?.kind === 'exam' ? existingEvent.courseId ?? '' : '',
  )
  const [examDate, setExamDate] = useState(
    existingEvent?.kind === 'exam' ? toDateInput(existingEvent.start) : initialDate,
  )
  const [examStart, setExamStart] = useState(
    existingEvent?.kind === 'exam' ? toTimeInput(existingEvent.start) : '09:00',
  )
  const [examEnd, setExamEnd] = useState(
    existingEvent?.kind === 'exam' ? toTimeInput(existingEvent.end) : '12:00',
  )
  const [examRoom, setExamRoom] = useState(
    existingEvent?.kind === 'exam' ? existingEvent.room ?? '' : '',
  )
  const [examWeight, setExamWeight] = useState(
    existingEvent?.kind === 'exam' && existingEvent.weight != null ? String(existingEvent.weight) : '',
  )

  const [overrideDate, setOverrideDate] = useState(
    existingOverride ? existingOverride.date : initialDate,
  )
  const [scheduleDay, setScheduleDay] = useState<string>(() => {
    if (!existingOverride) return 'none'
    return existingOverride.scheduleDay == null ? 'none' : String(existingOverride.scheduleDay)
  })
  const [overrideTitle, setOverrideTitle] = useState(existingOverride?.title ?? '')

  const handleSave = () => {
    const label =
      type === 'holiday'
        ? existingEvent
          ? 'Holiday updated'
          : 'Holiday added'
        : type === 'break'
          ? existingEvent
            ? 'Break updated'
            : 'Break added'
          : type === 'exam'
            ? existingEvent
              ? 'Exam updated'
              : 'Exam added'
            : 'Schedule updated'

    store.batch(label, (s) => {
      if (type === 'holiday') {
      const start = new Date(`${holidayDate}T00:00:00`).toISOString()
      const end = new Date(`${holidayDate}T23:59:59.999`).toISOString()
      if (existingEvent) {
        s.updatePlannerEvent(existingEvent.id, {
          title: holidayTitle.trim() || 'Holiday',
          kind: 'holiday',
          start,
          end,
          allDay: true,
        })
      } else {
        s.addPlannerEvent({
          title: holidayTitle.trim() || 'Holiday',
          kind: 'holiday',
          start,
          end,
          allDay: true,
        })
      }
    } else if (type === 'break') {
      const start = new Date(`${breakStart}T00:00:00`).toISOString()
      const end = new Date(`${breakEnd}T23:59:59.999`).toISOString()
      if (existingEvent) {
        s.updatePlannerEvent(existingEvent.id, {
          title: breakTitle.trim() || 'Reading break',
          kind: 'reading_break',
          start,
          end,
          allDay: true,
        })
      } else {
        s.addPlannerEvent({
          title: breakTitle.trim() || 'Reading break',
          kind: 'reading_break',
          start,
          end,
          allDay: true,
        })
      }
    } else if (type === 'exam') {
      const start = new Date(`${examDate}T${examStart}:00`).toISOString()
      const end = new Date(`${examDate}T${examEnd}:00`).toISOString()
      const weight = examWeight.trim() === '' ? undefined : Number(examWeight)
      const patch = {
        title: examTitle.trim() || 'Exam',
        kind: 'exam' as const,
        start,
        end,
        allDay: false,
        courseId: examCourseId || null,
        room: examRoom.trim() || undefined,
        weight: Number.isFinite(weight) ? weight : undefined,
      }
      if (existingEvent) {
        s.updatePlannerEvent(existingEvent.id, patch)
      } else {
        s.addPlannerEvent(patch)
      }
    } else {
      const sDay = scheduleDay === 'none' ? null : Number(scheduleDay)
      s.upsertScheduleOverride({
        date: overrideDate,
        scheduleDay: sDay,
        title: overrideTitle.trim() || undefined,
      })
      }
    })
    toast(label, { action: { label: 'Undo', run: () => store.undo() } })
    onClose()
  }

  const handleDelete = () => {
    const label = existingEvent ? 'Event removed' : 'Schedule override removed'
    store.batch(label, (s) => {
      if (existingEvent) s.removePlannerEvent(existingEvent.id)
      if (existingOverride) s.removeScheduleOverride(existingOverride.id)
    })
    toast(label, { action: { label: 'Undo', run: () => store.undo() } })
    onClose()
  }

  const isEditing = !!(existingEvent || existingOverride)
  const kindLabel = exceptionTypeLabel[type]

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${isEditing ? 'Edit' : 'Add'} ${kindLabel.toLowerCase()}`}
      footer={
        <div className="flex items-center gap-2">
          {isEditing && (
            <Button size="sm" variant="danger" onClick={handleDelete} aria-label="Delete exception">
              <Trash2 size={14} />
            </Button>
          )}
          <div className="flex-1" />
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" onClick={handleSave}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {!isEditing && (
          <Segmented
            size="sm"
            ariaLabel="Choose exception kind"
            value={type}
            onChange={(v) => setType(v as ExceptionType)}
            options={[
              { value: 'holiday', label: 'Holiday' },
              { value: 'break', label: 'Break' },
              { value: 'exam', label: 'Exam' },
              { value: 'override', label: 'Timetable switch' },
            ]}
            className="w-full [&>button]:flex-1"
          />
        )}

        {type === 'holiday' && (
          <>
            <Field label="Holiday name">
              <Input
                data-autofocus
                value={holidayTitle}
                onChange={(e) => setHolidayTitle(e.target.value)}
                placeholder="e.g. Labour Day, Thanksgiving"
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </Field>
          </>
        )}

        {type === 'break' && (
          <>
            <Field label="Break name">
              <Input
                data-autofocus
                value={breakTitle}
                onChange={(e) => setBreakTitle(e.target.value)}
                placeholder="e.g. Reading week, Spring break"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <Input
                  type="date"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                />
              </Field>
              <Field label="To">
                <Input
                  type="date"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}

        {type === 'exam' && (
          <>
            <Field label="Title">
              <Input
                data-autofocus
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="e.g. Midterm exam"
              />
            </Field>
            <Field label="Course">
              <Select value={examCourseId} onChange={(e) => setExamCourseId(e.target.value)}>
                <option value="">No course</option>
                {courses
                  .filter((course) => !course.archived || course.id === examCourseId)
                  .map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code}{course.title ? ` · ${course.title}` : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts at">
                <Input type="time" value={examStart} onChange={(e) => setExamStart(e.target.value)} />
              </Field>
              <Field label="Ends at">
                <Input type="time" value={examEnd} onChange={(e) => setExamEnd(e.target.value)} />
              </Field>
            </div>
            <Field label="Room">
              <Input
                value={examRoom}
                onChange={(e) => setExamRoom(e.target.value)}
                placeholder="e.g. Room 302"
              />
            </Field>
            <Field label="Weight">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={examWeight}
                onChange={(e) => setExamWeight(e.target.value)}
                placeholder="e.g. 25"
              />
            </Field>
          </>
        )}

        {type === 'override' && (
          <>
            <Field label="Date">
              <Input
                type="date"
                value={overrideDate}
                onChange={(e) => setOverrideDate(e.target.value)}
              />
            </Field>
            <Field label="This date follows">
              <Select value={scheduleDay} onChange={(e) => setScheduleDay(e.target.value)}>
                <option value="none">No classes</option>
                {WEEKDAYS.map((name, i) => (
                  <option key={name} value={i}>
                    {name} timetable
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Label (optional)">
              <Input
                value={overrideTitle}
                onChange={(e) => setOverrideTitle(e.target.value)}
                placeholder="e.g. Monday schedule after holiday"
              />
            </Field>
          </>
        )}
      </div>
    </Sheet>
  )
}
