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

type ExceptionType = 'holiday' | 'break' | 'override'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const exceptionTypeLabel: Record<ExceptionType, string> = {
  holiday: 'No classes / Holiday',
  break: 'Break',
  override: 'Timetable switch',
}

export function DayExceptionSheet({
  initialDate,
  initialType,
  existingEvent,
  existingOverride,
  onClose,
}: DayExceptionSheetProps) {
  const store = useStore()
  const { toast } = useToast()

  const [type, setType] = useState<ExceptionType>(() => {
    if (existingOverride) return 'override'
    if (existingEvent?.kind === 'reading_break') return 'break'
    return initialType === 'break' || initialType === 'override' ? initialType : 'holiday'
  })

  const [holidayTitle, setHolidayTitle] = useState(
    existingEvent && existingEvent.kind === 'holiday' ? existingEvent.title : 'No classes',
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
          ? 'Calendar exception updated'
          : 'Day off added'
        : type === 'break'
          ? existingEvent
            ? 'Break updated'
            : 'Break added'
          : 'Schedule updated'

    store.batch(label, (s) => {
      if (type === 'holiday') {
      const start = new Date(`${holidayDate}T00:00:00`).toISOString()
      const end = new Date(`${holidayDate}T23:59:59.999`).toISOString()
      if (existingEvent) {
        s.updatePlannerEvent(existingEvent.id, {
          title: holidayTitle.trim() || 'No classes',
          kind: 'holiday',
          start,
          end,
          allDay: true,
        })
      } else {
        s.addPlannerEvent({
          title: holidayTitle.trim() || 'No classes',
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
            ariaLabel="Choose calendar exception kind"
            value={type}
            onChange={(v) => setType(v as ExceptionType)}
            options={[
              { value: 'holiday', label: 'No classes / Holiday' },
              { value: 'break', label: 'Break' },
              { value: 'override', label: 'Timetable switch' },
            ]}
            className="w-full [&>button]:flex-1"
          />
        )}

        {type === 'holiday' && (
          <>
            <Field
              label="Reason / Name"
              hint="Use for holidays, snow days, cancelled classes, campus closures, or strike days when no classes are held."
            >
              <Input
                data-autofocus
                value={holidayTitle}
                onChange={(e) => setHolidayTitle(e.target.value)}
                placeholder="e.g. Snow day, Labour Day, Class cancelled"
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
