import { memo, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Edit2,
  Eye,
  FileText,
  Folder,
  FolderInput,
  ListPlus,
  ListTodo,
  MoreHorizontal,
  Pin,
  Plus,
  Sigma,
  StickyNote,
  Trash2,
} from 'lucide-react'
import type { Course, FocusNote, NoteFolder } from '../../lib/types'
import { useStore } from '../../lib/store'
import { fmtTimeAgo } from '../../lib/date'
import { CourseDot } from '../ui'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getNoteDisplayTitle,
  getNotePreviewMetadata,
  getNotePlainText,
  isJsonNote,
} from '../../lib/notes'

export function FolderDropdownTree({
  folders,
  currentFolderId,
  onSelectFolder,
  expandedIds,
  onToggleExpand,
  depth = 0,
  parentId = null,
}: {
  folders: NoteFolder[]
  currentFolderId?: string | null
  onSelectFolder: (folder: NoteFolder) => void
  expandedIds: Set<string>
  onToggleExpand: (folderId: string) => void
  depth?: number
  parentId?: string | null
}) {
  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, NoteFolder[]>()
    for (const folder of folders) {
      const key = folder.parentId ?? null
      const siblings = map.get(key)
      if (siblings) siblings.push(folder)
      else map.set(key, [folder])
    }
    return map
  }, [folders])

  return (
    <FolderDropdownTreeLevel
      foldersByParent={childrenByParent}
      currentFolderId={currentFolderId}
      onSelectFolder={onSelectFolder}
      expandedIds={expandedIds}
      onToggleExpand={onToggleExpand}
      depth={depth}
      parentId={parentId}
    />
  )
}

function FolderDropdownTreeLevel({
  foldersByParent,
  currentFolderId,
  onSelectFolder,
  expandedIds,
  onToggleExpand,
  depth,
  parentId,
}: {
  foldersByParent: Map<string | null, NoteFolder[]>
  currentFolderId?: string | null
  onSelectFolder: (folder: NoteFolder) => void
  expandedIds: Set<string>
  onToggleExpand: (folderId: string) => void
  depth: number
  parentId: string | null
}) {
  const atLevel = foldersByParent.get(parentId) ?? []
  if (atLevel.length === 0) return null

  return (
    <div className="flex flex-col">
      {atLevel.map((folder) => {
        const children = foldersByParent.get(folder.id) ?? []
        const hasChildren = children.length > 0
        const isExpanded = expandedIds.has(folder.id)
        const isCurrent = currentFolderId === folder.id

        return (
          <div key={folder.id} className="flex flex-col">
            <div
              onClick={() => onSelectFolder(folder)}
              style={{ paddingLeft: `${depth * 14 + 6}px` }}
              className={cx(
                'group relative flex items-center justify-between py-1.5 pr-2 rounded-md text-[12px] font-medium transition-colors cursor-pointer select-none',
                isCurrent
                  ? 'bg-[color-mix(in_srgb,var(--c-accent)_10%,transparent)] text-[var(--c-accent)] font-semibold'
                  : 'text-ink-2 hover:bg-tint hover:text-ink',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {hasChildren ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onToggleExpand(folder.id)
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    className="h-4 w-4 grid place-items-center text-ink-3 hover:text-ink rounded cursor-pointer shrink-0"
                    title={isExpanded ? 'Collapse subfolders' : 'Reveal subfolders'}
                  >
                    {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  </button>
                ) : (
                  <span className="w-4 shrink-0" />
                )}

                <Folder
                  size={14}
                  className={cx(
                    'shrink-0',
                    isCurrent ? 'text-[var(--c-accent)] fill-current' : 'text-ink-3',
                  )}
                />
                <span className="truncate">{folder.name}</span>
              </div>

              {isCurrent && <Check size={12} className="text-[var(--c-good)] shrink-0 ml-1" />}
            </div>

            {hasChildren && isExpanded && (
              <FolderDropdownTreeLevel
                foldersByParent={foldersByParent}
                currentFolderId={currentFolderId}
                onSelectFolder={onSelectFolder}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                depth={depth + 1}
                parentId={folder.id}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export interface NoteCardProps {
  note: FocusNote
  course: Course | null
  folder: NoteFolder | null
  courses: Course[]
  folders: NoteFolder[]
  generalFolders?: NoteFolder[]
  foldersByCourse?: Map<string | null, NoteFolder[]>
  onOpen: (noteId: string) => void
  onQuickPeek: (noteId: string) => void
  onMoveTo: (noteId: string, courseId: string | null, folderId: string | null) => void
  onTogglePin: (noteId: string) => void
  onToggleReviewed: (noteId: string) => void
  onDelete: (noteId: string) => void
  onOpenTask?: (taskId: string) => void
  showCourseBadge?: boolean
  showFolderBadge?: boolean
}

export const NoteCard = memo(function NoteCard({
  note,
  course,
  folder,
  courses,
  folders,
  generalFolders: providedGeneralFolders,
  foldersByCourse,
  onOpen,
  onQuickPeek,
  onMoveTo,
  onTogglePin,
  onToggleReviewed,
  onDelete,
  onOpenTask,
  showCourseBadge = true,
  showFolderBadge = true,
}: NoteCardProps) {
  const { toast } = useToast()
  const task = useStore((s) => (note.assignmentId ? s.assignments.find((a) => a.id === note.assignmentId) ?? null : null))

  const [isDragging, setIsDragging] = useState(false)
  const isReviewed = Boolean(note.reviewedAt)
  const isPinned = Boolean(note.isPinned)
  const displayTitle = getNoteDisplayTitle(note)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement>(null)
  const titleEditClosedRef = useRef(false)
  const titleEditCancelledRef = useRef(false)

  const { checklist: checklistInfo, plainLines, hasCode, hasMath } = useMemo(
    () => getNotePreviewMetadata(note.text),
    [note.text],
  )

  const excerptLines = useMemo(() => {
    if (plainLines.length === 0) return []
    const firstMatchesTitle = plainLines[0]?.trim() === displayTitle.trim()
    const slice = firstMatchesTitle ? plainLines.slice(1, 6) : plainLines.slice(0, 5)
    return slice.filter(Boolean)
  }, [plainLines, displayTitle])

  const [menuOpen, setMenuOpen] = useState(false)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)
  const [cardExpandedIds, setCardExpandedIds] = useState<Set<string>>(new Set())

  const handleToggleCardExpand = (folderId: string) => {
    setCardExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const handleMenuOpenChange = (open: boolean) => {
    setMenuOpen(open)
    if (open) {
      const ancestors = new Set<string>()
      let curr = note.folderId ? folders.find((f) => f.id === note.folderId) : null
      while (curr && curr.parentId) {
        ancestors.add(curr.parentId)
        curr = folders.find((f) => f.id === curr?.parentId)
      }
      setCardExpandedIds(ancestors)
    } else {
      setIsCreatingFolder(false)
      setNewFolderName('')
    }
  }

  const handleCreateAndMove = () => {
    const name = newFolderName.trim()
    if (!name) return
    const store = useStore.getState()
    store.batch(`Created folder "${name}" and moved note`, (s) => {
      const created = s.addNoteFolder({
        name,
        courseId: note.courseId,
        parentId: null,
      })
      onMoveTo(note.id, note.courseId ?? null, created.id)
    })
    setIsCreatingFolder(false)
    setNewFolderName('')
    setMenuOpen(false)
  }

  const handleCopyNoteText = () => {
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
      })
    }
  }

  const beginEditTitle = () => {
    setTitleDraft(note.title?.trim() || displayTitle)
    titleEditClosedRef.current = false
    titleEditCancelledRef.current = false
    setIsEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  const commitTitle = () => {
    if (!isEditingTitle || titleEditClosedRef.current) return
    titleEditClosedRef.current = true
    if (titleEditCancelledRef.current) {
      setIsEditingTitle(false)
      setTitleDraft('')
      return
    }
    const nextTitle = titleDraft.trim()
    const currentTitle = note.title?.trim() || ''
    if (nextTitle !== currentTitle) {
      useStore.getState().updateFocusNote(note.id, {
        title: nextTitle || undefined,
      })
    }
    setIsEditingTitle(false)
    setTitleDraft('')
  }

  const generalFolders = providedGeneralFolders ?? folders.filter((f) => !f.courseId)

  return (
    <div
      draggable
      onDragStart={(e) => {
        setIsDragging(true)
        e.dataTransfer.setData('application/nudge-note-id', note.id)
        e.dataTransfer.setData('text/plain', note.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => setIsDragging(false)}
      className={cx(
        'group flex flex-col select-none text-left w-full transition-opacity duration-150',
        isDragging && 'opacity-40',
      )}
    >
      <div
        onClick={() => onOpen(note.id)}
        className={cx(
          'relative h-[155px] w-full rounded-xl border bg-surface p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-150 overflow-hidden',
          'border-line/80 hover:border-line-2 hover:shadow-md hover:-translate-y-0.5',
          isPinned && 'border-[color-mix(in_srgb,var(--c-accent)_35%,var(--c-line))] bg-[color-mix(in_srgb,var(--c-accent)_2.5%,var(--c-surface))] shadow-xs',
          isReviewed && 'bg-surface/50 opacity-80',
        )}
      >
        <div className="flex items-center justify-between gap-2 select-none min-h-[24px]">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            {isReviewed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleReviewed(note.id)
                }}
                title="Marked as reviewed (click to mark active)"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-[var(--c-good-tint)] text-[var(--c-good)] border border-[var(--c-good)]/25 hover:bg-[var(--c-good)]/20 transition-colors cursor-pointer shrink-0"
              >
                <Check size={10} strokeWidth={2.5} />
                <span>Reviewed</span>
              </button>
            )}

            {note.sessionId && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-tint text-ink-2 shrink-0">
                <StickyNote size={10} />
                <span>Session</span>
              </span>
            )}

            {checklistInfo.total > 0 && (
              <span
                title={`${checklistInfo.completed} of ${checklistInfo.total} checklist items completed`}
                className={cx(
                  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium tnum shrink-0',
                  checklistInfo.completed === checklistInfo.total
                    ? 'bg-[var(--c-good-tint)] text-[var(--c-good)]'
                    : 'bg-tint text-ink-3',
                )}
              >
                <ListTodo size={10} />
                <span>
                  {checklistInfo.completed}/{checklistInfo.total}
                </span>
              </span>
            )}

            {hasCode && (
              <span className="text-ink-3/70 inline-flex items-center shrink-0" title="Contains code">
                <Code2 size={12} />
              </span>
            )}

            {hasMath && (
              <span className="text-ink-3/70 inline-flex items-center shrink-0" title="Contains math equations">
                <Sigma size={12} />
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => onQuickPeek(note.id)}
              title="Quick peek (preview note)"
              aria-label="Quick peek"
              className="h-6 w-6 rounded-md grid place-items-center text-ink-3 hover:text-ink hover:bg-tint transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
            >
              <Eye size={12.5} />
            </button>

            <button
              type="button"
              onClick={() => onTogglePin(note.id)}
              title={isPinned ? 'Unpin note' : 'Pin to top'}
              aria-label={isPinned ? 'Unpin note' : 'Pin to top'}
              className={cx(
                'h-6 w-6 rounded-md grid place-items-center transition-all cursor-pointer',
                isPinned
                  ? 'text-[var(--c-accent)] opacity-100'
                  : 'text-ink-3 hover:text-ink hover:bg-tint opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )}
            >
              <Pin
                size={12.5}
                className={cx(
                  'transition-transform',
                  isPinned ? 'fill-current rotate-45 scale-110' : 'rotate-45',
                )}
              />
            </button>

            <DropdownMenu modal={false} open={menuOpen} onOpenChange={handleMenuOpenChange}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="More actions"
                  aria-label="More actions"
                  className={cx(
                    'h-6 w-6 rounded-md grid place-items-center text-ink-3 hover:text-ink hover:bg-tint transition-all cursor-pointer',
                    menuOpen
                      ? 'opacity-100 bg-tint text-ink'
                      : 'opacity-0 max-sm:opacity-70 group-hover:opacity-100 focus-visible:opacity-100',
                  )}
                >
                  <MoreHorizontal size={13.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52 p-1"
                onClick={(e) => e.stopPropagation()}
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                <DropdownMenuItem onClick={() => onQuickPeek(note.id)}>
                  <Eye size={14} className="mr-2 text-ink-3" />
                  <span>Quick peek</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={beginEditTitle}>
                  <Edit2 size={14} className="mr-2 text-ink-3" />
                  <span>Rename note</span>
                </DropdownMenuItem>

                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput size={14} className="mr-2 text-ink-3" />
                    <span>Move to…</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="w-56 p-1 max-h-72 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-2 py-1 text-[10px] font-bold text-ink-3 uppercase tracking-wider">
                      Move to
                    </div>
                    <DropdownMenuItem
                      onClick={() => {
                        onMoveTo(note.id, null, null)
                        setMenuOpen(false)
                      }}
                    >
                      <FileText size={13} className="mr-2 text-ink-3" />
                      <span>General (Root)</span>
                      {!note.courseId && !note.folderId && (
                        <Check size={12} className="ml-auto text-[var(--c-good)]" />
                      )}
                    </DropdownMenuItem>

                    {generalFolders.length > 0 && (
                      <FolderDropdownTree
                        folders={generalFolders}
                        currentFolderId={note.folderId}
                        expandedIds={cardExpandedIds}
                        onToggleExpand={handleToggleCardExpand}
                        onSelectFolder={(f) => {
                          onMoveTo(note.id, null, f.id)
                          setMenuOpen(false)
                        }}
                        depth={1}
                      />
                    )}

                    {courses.map((c) => {
                      const courseFolders = foldersByCourse?.get(c.id) ?? folders.filter((f) => f.courseId === c.id)
                      return (
                        <div key={c.id}>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              onMoveTo(note.id, c.id, null)
                              setMenuOpen(false)
                            }}
                          >
                            <CourseDot course={c} size={15} className="mr-2" />
                            <span className="font-semibold">{c.code} (Root)</span>
                            {note.courseId === c.id && !note.folderId && (
                              <Check size={12} className="ml-auto text-[var(--c-good)]" />
                            )}
                          </DropdownMenuItem>
                          {courseFolders.length > 0 && (
                            <FolderDropdownTree
                              folders={courseFolders}
                              currentFolderId={note.folderId}
                              expandedIds={cardExpandedIds}
                              onToggleExpand={handleToggleCardExpand}
                              onSelectFolder={(f) => {
                                onMoveTo(note.id, c.id, f.id)
                                setMenuOpen(false)
                              }}
                              depth={1}
                            />
                          )}
                        </div>
                      )
                    })}

                    <DropdownMenuSeparator />

                    <div
                      className="p-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {isCreatingFolder ? (
                        <div
                          className="flex items-center gap-1.5 p-1 bg-surface"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Folder size={14} className="text-[var(--c-accent)] shrink-0 ml-1" />
                          <input
                            ref={newFolderInputRef}
                            type="text"
                            autoFocus
                            placeholder="New folder name…"
                            value={newFolderName}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                handleCreateAndMove()
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault()
                                setIsCreatingFolder(false)
                                setNewFolderName('')
                              }
                            }}
                            className="w-full p-0 text-[12px] font-medium text-ink bg-transparent border-0 border-b border-[var(--c-accent)] outline-none"
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCreateAndMove()
                            }}
                            disabled={!newFolderName.trim()}
                            className="h-5 px-2 rounded bg-invert-bg text-invert-ink text-[10.5px] font-semibold hover:opacity-90 disabled:opacity-40 shrink-0 cursor-pointer"
                          >
                            Add
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setIsCreatingFolder(true)
                            setTimeout(() => newFolderInputRef.current?.focus(), 50)
                          }}
                          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-[var(--c-accent)] hover:bg-tint rounded-md transition-colors cursor-pointer text-left"
                        >
                          <Plus size={13} />
                          <span>New folder…</span>
                        </button>
                      )}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuItem onClick={() => onTogglePin(note.id)}>
                  <Pin size={14} className={cx('mr-2', isPinned ? 'text-[var(--c-accent)] fill-current' : 'text-ink-3')} />
                  <span>{isPinned ? 'Unpin note' : 'Pin to top'}</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => onToggleReviewed(note.id)}>
                  <Check size={14} className={cx('mr-2', isReviewed ? 'text-[var(--c-good)]' : 'text-ink-3')} />
                  <span>{isReviewed ? 'Mark as active' : 'Mark as reviewed'}</span>
                </DropdownMenuItem>

                <DropdownMenuItem onClick={handleCopyNoteText}>
                  <Copy size={14} className="mr-2 text-ink-3" />
                  <span>Copy text</span>
                </DropdownMenuItem>

                {!note.assignmentId && (
                  <DropdownMenuItem onClick={handleConvertToTask}>
                    <ListPlus size={14} className="mr-2 text-ink-3" />
                    <span>Convert to task</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={() => onDelete(note.id)}
                  className="text-[var(--c-critical-ink)] focus:text-[var(--c-critical-ink)] focus:bg-[color-mix(in_srgb,var(--c-critical)_10%,transparent)]"
                >
                  <Trash2 size={14} className="mr-2" />
                  <span>Delete note</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex-1 min-h-0 mt-2 space-y-1.5 overflow-hidden">
          {excerptLines.length > 0 ? (
            excerptLines.map((line, i) => (
              <p key={i} className="text-[11.5px] text-ink-3 line-clamp-1 leading-relaxed">
                {line}
              </p>
            ))
          ) : (
            <p className="text-[11.5px] text-ink-3/50 italic">Empty note</p>
          )}
        </div>
      </div>

      <div className="mt-2.5 px-0.5 space-y-1.5">
        <div className="flex items-start gap-1.5 min-w-0">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitTitle()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  titleEditCancelledRef.current = true
                  commitTitle()
                }
              }}
              onBlur={commitTitle}
              className="min-w-0 flex-1 p-0 text-[13.5px] font-semibold text-ink leading-snug bg-transparent border-0 border-b border-[var(--c-accent)] outline-none rounded-none"
              aria-label="Edit note name"
            />
          ) : (
            <>
              <h3
                onClick={() => onOpen(note.id)}
                className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink leading-snug line-clamp-2 cursor-pointer hover:text-[var(--c-accent)] transition-colors"
                title={displayTitle}
              >
                {displayTitle}
              </h3>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  beginEditTitle()
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="Edit note name"
                aria-label="Edit note name"
                className="h-5 w-5 shrink-0 rounded grid place-items-center text-ink-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-ink hover:bg-tint transition-all cursor-pointer"
              >
                <Edit2 size={11} />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] tnum flex-wrap">
          {showCourseBadge && course && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-tint font-medium text-ink-2 shrink-0">
              <CourseDot course={course} size={11} />
              <span>{course.code}</span>
            </span>
          )}

          {showFolderBadge && folder && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-tint/60 text-ink-3 shrink-0 truncate max-w-[110px]">
              <Folder size={11} className="shrink-0" />
              <span className="truncate">{folder.name}</span>
            </span>
          )}

          {task && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenTask?.(task.id)
              }}
              disabled={!onOpenTask}
              className={cx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-tint/60 text-ink-3 min-w-0 max-w-full text-left transition-colors',
                onOpenTask ? 'hover:bg-tint hover:text-ink cursor-pointer' : 'cursor-default',
              )}
              title={`Linked task: ${task.title}`}
            >
              <ListTodo size={11} className="shrink-0" />
              <span className="truncate">{task.title}</span>
            </button>
          )}

          <span className="text-[11px] text-ink-3/70 shrink-0 font-medium px-0.5">
            {fmtTimeAgo(note.updatedAt || note.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
})