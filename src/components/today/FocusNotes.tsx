import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, Copy, CornerDownLeft, ListPlus, Pencil, StickyNote, Trash2 } from 'lucide-react'
import { fmtTimeAgo } from '../../lib/date'
import type { FocusNote } from '../../lib/types'
import { useStore } from '../../lib/store'
import { CourseDot, Panel, SectionTitle } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import { getNotePlainText, isJsonNote } from '../../lib/notes'

export function NoteComposer({
  onSave,
  initialCourseId = '',
  initialAssignmentId = '',
  placeholder = 'Jot a note',
  compact = false,
  autoFocus = false,
  hideCourseSelector = false,
  hideSaveHint = false,
}: {
  onSave: (text: string, courseId: string, assignmentId: string) => void
  initialCourseId?: string
  initialAssignmentId?: string
  placeholder?: string
  compact?: boolean
  autoFocus?: boolean
  hideCourseSelector?: boolean
  hideSaveHint?: boolean
}) {
  const courses = useStore((s) => s.courses).filter((course) => !course.archived)
  const [text, setText] = useState('')
  const [courseId, setCourseId] = useState(initialCourseId)
  const [assignmentId, setAssignmentId] = useState(initialAssignmentId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const save = () => {
    const value = text.trim()
    if (!value) return
    onSave(value, courseId, assignmentId)
    setText('')
    if (!initialCourseId) setCourseId('')
    if (!initialAssignmentId) setAssignmentId('')
  }

  return (
    <div
      className="rounded-xl border border-line bg-surface p-2.5 flex flex-col gap-2 transition-all duration-150 focus-within:border-ink/40 focus-within:shadow-xs cursor-text"
      onClick={() => textareaRef.current?.focus()}
    >
      <textarea
        ref={textareaRef}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 500))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          }
        }}
        placeholder={placeholder}
        aria-label="Note content"
        rows={compact ? 2 : 3}
        className={cx(
          'w-full resize-none border-0 bg-transparent px-1.5 py-1 text-ink placeholder:text-ink-3 focus:outline-none focus:ring-0 leading-relaxed caret-current',
          compact ? 'text-[13px]' : 'text-[13.5px]',
        )}
      />

      <div
        className={cx(
          'flex flex-wrap items-center justify-between gap-2 pt-1.5 cursor-default',
          !hideSaveHint && 'border-t border-line/60',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {!hideCourseSelector && courses.length > 0 ? (
          <div className="flex items-center gap-1 overflow-x-auto scroll-pills py-0.5 max-w-[calc(100%-75px)]">
            <button
              type="button"
              onClick={() => {
                setCourseId('')
                setAssignmentId('')
              }}
              className={cx(
                'h-5 px-2 rounded-full text-[10.5px] font-medium transition-all shrink-0',
                !courseId
                  ? 'bg-ink text-surface shadow-xs'
                  : 'bg-tint text-ink-3 hover:text-ink hover:bg-tint-strong',
              )}
            >
              General
            </button>
            {courses.map((c) => {
              const selected = courseId === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCourseId(selected ? '' : c.id)
                    setAssignmentId('')
                  }}
                  className={cx(
                    'h-6 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5',
                    selected
                      ? 'bg-ink text-surface shadow-xs'
                      : 'bg-tint text-ink-3 hover:text-ink hover:bg-tint-strong',
                  )}
                >
                  <CourseDot course={c} size={13} />
                  {c.code}
                </button>
              )
            })}
          </div>
        ) : !hideSaveHint ? (
          <span className="text-[10.5px] text-ink-3">Press Enter to save</span>
        ) : null}

        <button
          type="button"
          onClick={save}
          disabled={!text.trim()}
          className="ml-auto inline-flex items-center gap-1 h-6 px-2.5 rounded-lg bg-invert-bg text-invert-ink text-[11.5px] font-medium disabled:opacity-30 transition-all hover:opacity-90 active:scale-95 shrink-0 cursor-pointer"
        >
          <span>Save</span>
          <CornerDownLeft size={11} />
        </button>
      </div>
    </div>
  )
}

export function NoteItem({
  note,
  onOpenTask,
  onOpenNote,
  comfortable = false,
}: {
  note: FocusNote
  onOpenTask?: (id: string) => void
  onOpenNote?: (id: string) => void
  comfortable?: boolean
}) {
  const store = useStore()
  const courses = useStore((s) => s.courses).filter((c) => !c.archived)
  const assignments = useStore((s) => s.assignments)
  const { toast } = useToast()

  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(() => getNotePlainText(note.text))
  const [editCourseId, setEditCourseId] = useState(note.courseId ?? '')
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    const textToCopy = getNotePlainText(note.text) || (isJsonNote(note.text) ? '' : note.text)
    navigator.clipboard?.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
    toast('Note copied')
  }

  const course = note.courseId ? courses.find((c) => c.id === note.courseId) : null
  const task = note.assignmentId ? assignments.find((a) => a.id === note.assignmentId) : null
  const isReviewed = Boolean(note.reviewedAt)

  const startEditing = () => {
    setEditText(getNotePlainText(note.text))
    setEditCourseId(note.courseId ?? '')
    setIsEditing(true)
  }

  const handleToggleReviewed = () => {
    store.markFocusNoteReviewed(note.id, !isReviewed)
    toast(isReviewed ? 'Note marked active' : 'Note reviewed', {
      action: { label: 'Undo', run: () => store.undo() },
    })
  }

  const handleSaveEdit = () => {
    const trimmed = editText.trim()
    if (!trimmed) {
      store.removeFocusNote(note.id)
      toast('Note removed', { action: { label: 'Undo', run: () => store.undo() } })
      return
    }
    store.updateFocusNote(note.id, {
      text: trimmed,
      courseId: editCourseId || null,
    })
    setIsEditing(false)
    toast('Note updated', { action: { label: 'Undo', run: () => store.undo() } })
  }

  const handleCancelEdit = () => {
    setEditText(getNotePlainText(note.text))
    setEditCourseId(note.courseId ?? '')
    setIsEditing(false)
  }

  const handleConvertToTask = () => {
    const a = store.convertFocusNoteToTask(note.id)
    if (a) {
      toast(`Created task: ${a.title}`, {
        tone: 'good',
        action: {
          label: 'Undo',
          run: () => store.undo(),
        },
        secondaryAction: onOpenTask
          ? {
              label: 'Open',
              run: () => onOpenTask(a.id),
            }
          : undefined,
      })
    }
  }

  const handleDelete = () => {
    store.removeFocusNote(note.id)
    toast('Note deleted', {
      action: {
        label: 'Undo',
        run: () => store.undo(),
      },
    })
  }

  if (isEditing) {
    return (
      <div className="p-2.5 rounded-xl border border-ink/30 bg-surface shadow-xs flex flex-col gap-2 a-fade my-1 cursor-text">
        <textarea
          autoFocus
          data-escape-guard
          value={editText}
          onChange={(e) => setEditText(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSaveEdit()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              handleCancelEdit()
            }
          }}
          className="w-full resize-none border-0 bg-transparent px-1.5 py-1 text-[13px] leading-relaxed text-ink focus:outline-none focus:ring-0 min-h-[48px] caret-current"
          rows={2}
          aria-label="Edit note text"
        />

        {courses.length > 0 && (
          <div className="flex items-center gap-1 overflow-x-auto scroll-pills py-0.5 border-t border-line/60 pt-1.5">
            <span className="text-[10.5px] text-ink-3 font-medium shrink-0">Course:</span>
            <button
              type="button"
              onClick={() => setEditCourseId('')}
              className={cx(
                'h-5 px-2 rounded-full text-[10.5px] font-medium transition-all shrink-0',
                !editCourseId
                  ? 'bg-ink text-surface'
                  : 'bg-tint text-ink-3 hover:text-ink hover:bg-tint-strong',
              )}
            >
              General
            </button>
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setEditCourseId(editCourseId === c.id ? '' : c.id)}
                className={cx(
                  'h-6 px-2.5 rounded-full text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5',
                  editCourseId === c.id
                    ? 'bg-ink text-surface'
                    : 'bg-tint text-ink-3 hover:text-ink hover:bg-tint-strong',
                )}
              >
                <CourseDot course={c} size={13} />
                {c.code}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-line/60 text-[11px]">
          <span className="text-ink-3">Enter to save · Esc to cancel</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="h-6 px-2 rounded-md text-ink-3 hover:text-ink hover:bg-tint transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={!editText.trim()}
              className="h-6 px-2.5 rounded-md bg-invert-bg text-invert-ink font-medium disabled:opacity-30 transition-all hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cx(
        'group relative flex items-start gap-2.5 px-2 py-2 rounded-xl transition-colors duration-150',
        'hover:bg-tint/50',
      )}
    >
      <button
        type="button"
        onClick={handleToggleReviewed}
         aria-label={isReviewed ? 'Mark note as active' : 'Mark note as reviewed'}
         title={isReviewed ? 'Mark active' : 'Mark reviewed'}
        className={cx(
          'mt-0.5 h-[17px] w-[17px] rounded-full border-[1.5px] grid place-items-center shrink-0 transition-transform hover:scale-110 active:scale-95',
          isReviewed
            ? 'bg-[var(--c-good)] border-[var(--c-good)] text-white'
            : 'border-line-2 text-transparent hover:border-ink hover:text-ink-3',
        )}
      >
        <Check size={10} strokeWidth={3} />
      </button>

      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={onOpenNote ? () => onOpenNote(note.id) : startEditing}
        title="Click to view & edit"
      >
        <p
          className={cx(
            'leading-snug text-ink whitespace-pre-wrap break-words transition-colors hover:text-ink-2',
            comfortable ? 'text-[14px] leading-relaxed' : 'text-[13px]',
          )}
        >
          {getNotePlainText(note.text) || (isJsonNote(note.text) ? 'Empty note' : note.text)}
        </p>

        <div className={cx('mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-ink-3', comfortable ? 'text-[11.5px]' : 'text-[11px]')}>
          {course && (
            <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
              <CourseDot course={course} size={13} />
              <span>{course.code}</span>
            </span>
          )}
          {task && (
            <button
              type="button"
              onClick={(e) => {
                if (onOpenTask) {
                  e.stopPropagation()
                  onOpenTask(task.id)
                }
              }}
              title={`Open linked task: ${task.title}`}
              className={cx(
                'inline-flex items-center gap-1 truncate max-w-[150px] font-medium text-ink-2 bg-tint hover:bg-tint-strong px-1.5 py-0.5 rounded transition-colors',
                onOpenTask && 'cursor-pointer',
              )}
            >
              <span className="truncate">↳ {task.title}</span>
            </button>
          )}
          <span>· {fmtTimeAgo(note.createdAt)}</span>
        </div>
      </div>

      <div className="flex items-center gap-0.5 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={onOpenNote ? () => onOpenNote(note.id) : startEditing}
          aria-label="Edit note"
          title="Edit"
          className="h-6 w-6 grid place-items-center rounded-md text-ink-3 hover:bg-tint hover:text-ink transition-colors"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy note text"
          title={copied ? 'Copied!' : 'Copy'}
          className="h-6 w-6 grid place-items-center rounded-md text-ink-3 hover:bg-tint hover:text-ink transition-colors"
        >
          {copied ? <Check size={11} className="text-[var(--c-good)]" /> : <Copy size={11} />}
        </button>
        {!isReviewed && !note.assignmentId && (
          <button
            type="button"
            onClick={handleConvertToTask}
            aria-label="Turn note into task"
            title="Turn into task"
            className="h-6 px-1.5 flex items-center gap-1 rounded-md text-[11px] font-medium text-ink-3 hover:bg-tint hover:text-ink transition-colors"
          >
            <ListPlus size={12} />
            <span className="hidden sm:inline text-[10.5px]">Task</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Delete note"
          title="Delete"
          className="h-6 w-6 grid place-items-center rounded-md text-ink-3 hover:bg-tint hover:text-[var(--c-critical-ink)] transition-colors"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}

export function FocusNotes({
  onOpenCapture,
  onOpenTask,
  onOpenNote,
  onGoNotes,
  className,
  style,
}: {
  onOpenCapture?: () => void
  onOpenTask?: (id: string) => void
  onOpenNote?: (id: string) => void
  onGoNotes?: () => void
  className?: string
  style?: CSSProperties
}) {
  const store = useStore()
  const notes = useStore((s) => s.focusNotes.filter((note) => !note.studyId))
  const courses = useStore((s) => s.courses).filter((c) => !c.archived)
  const { toast } = useToast()

  const [filterCourse, setFilterCourse] = useState<string>('all')
  const [showReviewed, setShowReviewed] = useState(false)

  const activeNotes = notes.filter((n) => !n.reviewedAt)
  const reviewedNotes = notes.filter((n) => Boolean(n.reviewedAt))

  const coursesWithNotes = useMemo(() => {
    const ids = new Set(notes.map((n) => n.courseId).filter(Boolean))
    return courses.filter((c) => ids.has(c.id))
  }, [notes, courses])

  const displayedNotes = useMemo(() => {
    const list = showReviewed ? reviewedNotes : activeNotes
    if (filterCourse === 'all') return list
    return list.filter((n) => n.courseId === filterCourse)
  }, [showReviewed, reviewedNotes, activeNotes, filterCourse])

  const save = (text: string, courseId: string, assignmentId: string) => {
    store.addFocusNote({ text, courseId: courseId || null, assignmentId: assignmentId || null })
    toast('Note saved')
  }

  return (
    <Panel as="section" style={style} className={cx('p-3.5 flex flex-col gap-2.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <SectionTitle
          right={
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-3 font-medium">
                <StickyNote size={12} />
                {activeNotes.length}
              </span>
              {reviewedNotes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowReviewed((v) => !v)}
                  className={cx(
                    'text-[11px] font-medium px-1.5 py-0.5 rounded-md transition-colors',
                    showReviewed ? 'bg-tint text-ink' : 'text-ink-3 hover:text-ink',
                  )}
                >
                   {showReviewed ? 'Active' : `Reviewed (${reviewedNotes.length})`}
                </button>
              )}
              {onGoNotes && (
                <button
                  type="button"
                  onClick={onGoNotes}
                  className="text-[11px] font-medium text-ink-2 hover:text-ink bg-tint hover:bg-tint-strong px-2 py-0.5 rounded-md transition-colors flex items-center gap-1"
                >
                  <span>Open hub</span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          }
        >
          Study Notes
        </SectionTitle>
      </div>

      <NoteComposer compact onSave={save} />

      {coursesWithNotes.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto scroll-pills py-0.5 pb-1">
          <button
            type="button"
            onClick={() => setFilterCourse('all')}
            className={cx(
              'h-5 px-2 rounded-full text-[10.5px] font-medium transition-colors shrink-0',
              filterCourse === 'all'
                ? 'bg-ink text-surface'
                : 'text-ink-3 hover:text-ink hover:bg-tint',
            )}
          >
            All ({showReviewed ? reviewedNotes.length : activeNotes.length})
          </button>
          {coursesWithNotes.map((c) => {
            const count = (showReviewed ? reviewedNotes : activeNotes).filter((n) => n.courseId === c.id).length
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setFilterCourse(c.id)}
                className={cx(
                  'h-6 px-2.5 rounded-full text-[11px] font-medium transition-colors shrink-0 flex items-center gap-1.5',
                  filterCourse === c.id
                    ? 'bg-ink text-surface shadow-xs'
                    : 'text-ink-3 hover:text-ink hover:bg-tint',
                )}
              >
                <CourseDot course={c} size={13} />
                <span>{c.code} {count > 0 && `(${count})`}</span>
              </button>
            )
          })}
        </div>
      )}

      {displayedNotes.length > 0 ? (
        <div className="flex flex-col gap-0.5 -mx-1">
          {displayedNotes.slice(0, 5).map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              onOpenTask={onOpenTask}
              onOpenNote={onOpenNote}
            />
          ))}
          {displayedNotes.length > 5 && onGoNotes && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onGoNotes}
                className="text-[11.5px] font-medium text-ink-2 hover:text-ink hover:underline"
              >
                + {displayedNotes.length - 5} more notes in Notes hub →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="py-4 px-3 text-center rounded-xl bg-surface-2/40 border border-line/40">
          <p className="text-[12px] font-medium text-ink-2">
            {showReviewed
                 ? 'No reviewed Study Notes'
              : filterCourse !== 'all'
                 ? 'No open Study Notes for this course'
                 : 'No open Study Notes'}
          </p>
          <p className="text-[11px] text-ink-3 mt-0.5 max-w-[28ch] mx-auto leading-relaxed">
            {showReviewed
                ? 'Reviewed Study Notes will appear here.'
              : 'Perhaps you ought to make one.'}
          </p>
        </div>
      )}

      {onOpenCapture && (
        <button
          type="button"
          onClick={onOpenCapture}
          className="text-left text-[11.5px] font-medium text-ink-3 hover:text-ink transition-colors pt-0.5"
        >
          Open quick capture (D)
        </button>
      )}
    </Panel>
  )
}
