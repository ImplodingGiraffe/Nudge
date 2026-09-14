import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Folder,
  HelpCircle,
  ListPlus,
  ListTodo,
  Pin,
  Sparkles,
  X,
} from 'lucide-react'
import type { Course, FocusNote, NoteFolder } from '../../lib/types'
import { useStore } from '../../lib/store'
import { fmtTimeAgo } from '../../lib/date'
import { Button, CourseDot } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import {
  getNoteChecklist,
  getNoteDisplayTitle,
  getNotePlainLines,
  getNotePlainText,
  getNoteQuestions,
  getNoteUncertainties,
  isStudyNote,
  isJsonNote,
} from '../../lib/notes'
import { generateNoteTitle } from '../../lib/ai/auto-titler'

export interface NotePeekModalProps {
  note: FocusNote | null
  course: Course | null
  folder: NoteFolder | null
  notesList: FocusNote[]
  onClose: () => void
  onSelectNote: (note: FocusNote) => void
  onOpenFullEditor: (note: FocusNote) => void
  onOpenTask?: (id: string) => void
}

export function NotePeekModal({
  note,
  course,
  folder,
  notesList,
  onClose,
  onSelectNote,
  onOpenFullEditor,
  onOpenTask,
}: NotePeekModalProps) {
  const { toast } = useToast()
  const [isAutoTitling, setIsAutoTitling] = useState(false)

  const currentIndex = useMemo(() => {
    if (!note) return -1
    return notesList.findIndex((n) => n.id === note.id)
  }, [note, notesList])

  const prevNote = currentIndex > 0 ? notesList[currentIndex - 1] : null
  const nextNote = currentIndex >= 0 && currentIndex < notesList.length - 1 ? notesList[currentIndex + 1] : null

  useEffect(() => {
    if (!note) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowLeft' && prevNote) {
        e.preventDefault()
        onSelectNote(prevNote)
      } else if (e.key === 'ArrowRight' && nextNote) {
        e.preventDefault()
        onSelectNote(nextNote)
      } else if ((e.key === 'Enter' || e.key === 'e' || e.key === 'E') && !e.metaKey && !e.ctrlKey) {

        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault()
          onOpenFullEditor(note)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [note, prevNote, nextNote, onClose, onSelectNote, onOpenFullEditor])

  if (!note) return null

   const isReviewed = Boolean(note.reviewedAt)
  const isPinned = Boolean(note.isPinned)
  const isStudy = isStudyNote(note)
  const displayTitle = getNoteDisplayTitle(note)
  const checklistInfo = getNoteChecklist(note.text)
  const questions = getNoteQuestions(note.text)
  const uncertainties = getNoteUncertainties(note.text)
  const plainLines = getNotePlainLines(note.text)
  const wordCount = plainLines.join(' ').trim().split(/\s+/).filter(Boolean).length
  const readingMin = Math.max(1, Math.ceil(wordCount / 200))

  const handleToggleReviewed = () => {
     useStore.getState().markFocusNoteReviewed(note.id, !isReviewed)
     toast(isReviewed ? 'Note marked active' : 'Note reviewed')
  }

  const handleTogglePinned = () => {
    useStore.getState().updateFocusNote(note.id, { isPinned: !isPinned })
    toast(isPinned ? 'Note unpinned' : 'Note pinned to top')
  }

  const handleToggleNoteType = () => {
    const nextType = isStudy ? 'lecture' : 'study'
    useStore.getState().updateFocusNote(note.id, { noteType: nextType })
    toast(nextType === 'study' ? 'Turned into a study note' : 'Turned into a lecture note', {
      action: { label: 'Undo', run: () => useStore.getState().undo() },
    })
  }

  const handleCopy = () => {
    const textToCopy = getNotePlainText(note.text) || (isJsonNote(note.text) ? '' : note.text)
    navigator.clipboard?.writeText(textToCopy)
    toast('Note copied to clipboard')
  }

  const handleConvertToTask = () => {
    const a = useStore.getState().convertFocusNoteToTask(note.id)
    if (a) {
      toast(`Created task: ${a.title}`, {
        tone: 'good',
        action: {
          label: 'Undo',
          run: () => useStore.getState().undo(),
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

  const handleAutoTitle = async () => {
    if (isAutoTitling) return
    setIsAutoTitling(true)
    try {
      const res = await generateNoteTitle({
        text: note.text,
        courseCode: course?.code,
      })
      useStore.getState().updateFocusNote(note.id, { title: res.title })
      toast(
        res.isLocal
          ? `Title set: "${res.title}"`
          : `Title generated via ${res.model}: "${res.title}"`,
      )
    } catch {
      toast('Could not generate title', { tone: 'warn' })
    } finally {
      setIsAutoTitling(false)
    }
  }

  let renderedNodes: any[] = []
  if (isJsonNote(note.text)) {
    try {
      const parsed = JSON.parse(note.text)
      if (Array.isArray(parsed)) {
        renderedNodes = parsed
      }
    } catch {}
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/45 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[88vh] bg-surface rounded-2xl shadow-2xl border border-line flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="h-14 px-4 sm:px-6 border-b border-line shrink-0 flex items-center justify-between gap-3 bg-surface">
          <div className="flex items-center gap-2 min-w-0">
            {}
            <div className="flex items-center gap-0.5 mr-1">
              <button
                type="button"
                disabled={!prevNote}
                onClick={() => prevNote && onSelectNote(prevNote)}
                title="Previous note (←)"
                className="h-7 w-7 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-tint disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                disabled={!nextNote}
                onClick={() => nextNote && onSelectNote(nextNote)}
                title="Next note (→)"
                className="h-7 w-7 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-tint disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {}
            {course ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-tint text-ink-2 shrink-0">
                <CourseDot course={course} size={14} />
                <span>{course.code}</span>
              </span>
            ) : (
              <span className="text-[12px] font-medium text-ink-3">General</span>
            )}

            {folder && (
              <>
                <span className="text-ink-3">/</span>
                <span className="inline-flex items-center gap-1 text-[12px] text-ink-2 font-medium truncate max-w-[150px]">
                  <Folder size={12} className="text-ink-3 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                </span>
              </>
            )}

            <button
              type="button"
              onClick={handleToggleNoteType}
              title="Toggle note type"
              className={cx(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
                isStudy
                  ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] hover:bg-[color-mix(in_srgb,var(--c-accent)_20%,transparent)]'
                  : 'bg-tint text-ink-2 hover:bg-tint-2',
              )}
            >
              {isStudy ? 'Study note' : 'Lecture note'}
            </button>
          </div>

          {}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="quiet"
              onClick={handleAutoTitle}
              disabled={isAutoTitling}
              title="Auto-title with Gemini 3.8 Flash"
              className="h-8 text-[12px] gap-1 px-2.5 text-[var(--c-accent)] hover:bg-tint"
            >
              <Sparkles size={13} className={isAutoTitling ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Auto-title</span>
            </Button>

            <Button
              size="sm"
              variant="quiet"
              onClick={handleTogglePinned}
              title={isPinned ? 'Unpin note' : 'Pin note'}
              className={cx('h-8 w-8 p-0 justify-center', isPinned && 'text-[var(--c-accent)]')}
            >
              <Pin size={14} className={isPinned ? 'fill-current rotate-45' : ''} />
            </Button>

            <button
              type="button"
              onClick={handleToggleReviewed}
              className={cx(
                'h-8 px-2.5 rounded-lg text-[11px] font-semibold tracking-wide uppercase flex items-center gap-1.5 transition-all cursor-pointer',
                 isReviewed
                  ? 'bg-[var(--c-good-tint)] text-[var(--c-good)] border border-[var(--c-good)]/30'
                  : 'bg-tint text-ink-3 hover:text-ink hover:bg-tint-2',
              )}
            >
              <Check size={12} strokeWidth={3} />
               <span className="hidden sm:inline">{isReviewed ? 'Reviewed' : 'Active'}</span>
            </button>

            {!note.reviewedAt && !note.assignmentId && (
              <Button
                size="sm"
                variant="quiet"
                onClick={handleConvertToTask}
                title="Convert to actionable task"
                className="h-8 text-[11.5px] gap-1 px-2"
              >
                <ListPlus size={13} />
                <span className="hidden md:inline">To Task</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="quiet"
               onClick={handleToggleNoteType}
               title={isStudy ? 'Turn into lecture note' : 'Turn into study note'}
               className="h-8 text-[11.5px] gap-1 px-2"
             >
               <span className="hidden md:inline">{isStudy ? 'To Lecture' : 'To Study'}</span>
             </Button>

             <Button
               size="sm"
               variant="quiet"
              onClick={handleCopy}
              title="Copy note text"
              className="h-8 w-8 p-0 justify-center"
            >
              <Copy size={13} />
            </Button>

            <Button
              size="sm"
              variant="primary"
              onClick={() => onOpenFullEditor(note)}
              title="Open in full Plate editor (Enter / E)"
              className="h-8 text-[12px] gap-1.5 px-3 ml-1"
            >
              <ExternalLink size={13} />
              <span>Open Editor</span>
            </Button>

            <button
              type="button"
              onClick={onClose}
              title="Close peek (Esc)"
              className="h-8 w-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-tint ml-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 space-y-6 scroll-slim">
          {}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-ink tracking-tight leading-tight">
              {displayTitle}
            </h1>

            {}
            {(checklistInfo.total > 0 || questions.length > 0 || uncertainties.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                {checklistInfo.total > 0 && (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-tint border border-line text-[12px] font-medium text-ink-2">
                    <ListTodo size={13} className="text-ink-3" />
                    <span>
                      Checklist: {checklistInfo.completed}/{checklistInfo.total}
                    </span>
                  </div>
                )}

                {questions.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-tint border border-line text-[12px] font-medium text-ink-2">
                    <HelpCircle size={13} className="text-ink-3" />
                    <span>{questions.length} Question{questions.length > 1 ? 's' : ''}</span>
                  </span>
                )}

                {uncertainties.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-tint border border-line text-[12px] font-medium text-ink-2">
                    <AlertTriangle size={13} className="text-ink-3" />
                    <span>{uncertainties.length} Flagged</span>
                  </span>
                )}
              </div>
            )}
          </div>

          {}
          <div className="prose dark:prose-invert max-w-none text-ink leading-relaxed space-y-4">
            {renderedNodes.length > 0 ? (
              renderedNodes.map((node: any, idx: number) => {
                if (!node) return null

                if (node.type === 'h1') {
                  const text = node.children?.map((c: any) => c.text || '').join('') || ''
                  return (
                    <h2 key={idx} className="text-xl font-bold text-ink mt-6 mb-2">
                      {text}
                    </h2>
                  )
                }
                if (node.type === 'h2') {
                  const text = node.children?.map((c: any) => c.text || '').join('') || ''
                  return (
                    <h3 key={idx} className="text-lg font-semibold text-ink mt-5 mb-2">
                      {text}
                    </h3>
                  )
                }
                if (node.type === 'h3') {
                  const text = node.children?.map((c: any) => c.text || '').join('') || ''
                  return (
                    <h4 key={idx} className="text-base font-semibold text-ink-2 mt-4 mb-1">
                      {text}
                    </h4>
                  )
                }

                if (node.type === 'callout') {
                  const inner = node.children?.[0]?.children?.map((c: any) => c.text || '').join('') || ''
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3.5 rounded-xl bg-tint/60 border border-line"
                    >
                      <Sparkles size={16} className="text-[var(--c-accent)] shrink-0 mt-0.5" />
                      <p className="text-[13.5px] text-ink leading-normal m-0">{inner}</p>
                    </div>
                  )
                }

                if (node.type === 'equation' && node.texExpression) {
                  return (
                    <div
                      key={idx}
                      className="my-3 p-4 rounded-xl bg-sunken/60 border border-line/60 font-mono text-center text-[14px] text-ink"
                    >
                      {node.texExpression}
                    </div>
                  )
                }

                if (node.type === 'code_block' && Array.isArray(node.children)) {
                  const code = node.children
                    .map((l: any) => l.children?.map((c: any) => c.text || '').join('') || '')
                    .join('\n')
                  return (
                    <div key={idx} className="my-3 rounded-xl bg-sunken/80 border border-line overflow-hidden">
                      <div className="px-3 py-1.5 bg-sunken border-b border-line text-[11px] font-mono text-ink-3 uppercase flex items-center gap-1.5">
                        <Code2 size={12} />
                        <span>{node.lang || 'code'}</span>
                      </div>
                      <pre className="p-4 text-[13px] font-mono text-ink overflow-x-auto leading-relaxed">
                        <code>{code}</code>
                      </pre>
                    </div>
                  )
                }

                if (node.type === 'action_item') {
                  const text = node.children?.map((c: any) => c.text || '').join('') || ''
                  return (
                    <div key={idx} className="flex items-center gap-2.5 my-1.5 text-[14px]">
                      <div
                        className={cx(
                          'h-4 w-4 rounded-[4px] border grid place-items-center shrink-0',
                          node.checked
                            ? 'bg-[var(--c-good)] border-[var(--c-good)] text-white'
                            : 'border-line-2',
                        )}
                      >
                        {node.checked && <Check size={10} strokeWidth={3} />}
                      </div>
                      <span className={cx(node.checked && 'line-through text-ink-3')}>{text}</span>
                    </div>
                  )
                }

                if (node.type === 'blockquote') {
                  const quote = node.children?.[0]?.children?.map((c: any) => c.text || '').join('') || ''
                  return (
                    <blockquote
                      key={idx}
                      className="border-l-4 border-[var(--c-accent)] pl-4 italic text-ink-2 my-3"
                    >
                      {quote}
                    </blockquote>
                  )
                }

                const pText = node.children?.map((c: any) => c.text || '').join('') || ''
                if (!pText.trim()) return null
                return (
                  <p key={idx} className="text-[14px] text-ink leading-relaxed my-2">
                    {pText}
                  </p>
                )
              })
            ) : (
              plainLines.map((line, idx) => (
                <p key={idx} className="text-[14px] text-ink leading-relaxed my-2">
                  {line}
                </p>
              ))
            )}
          </div>
        </div>

        {}
        <div className="h-12 px-6 border-t border-line/60 bg-surface-2/40 shrink-0 flex items-center justify-between text-[11.5px] text-ink-3 tnum">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              Created {fmtTimeAgo(note.createdAt)}
            </span>
            <span>·</span>
            <span>{wordCount} words</span>
            <span>·</span>
            <span>~{readingMin}m reading time</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-ink-3">
              Press <kbd className="px-1.5 py-0.5 rounded bg-tint text-[10.5px] font-mono">E</kbd> to edit or{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-tint text-[10.5px] font-mono">Esc</kbd> to close
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
