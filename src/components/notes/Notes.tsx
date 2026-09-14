import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit2,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  ListTodo,
  Menu,
  MoreHorizontal,
  PanelLeft,
  Pin,
  Plus,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import type { Course, FocusNote, NoteFolder, NoteType } from '../../lib/types'
import { useStore } from '../../lib/store'
import { fmtTimeAgo } from '../../lib/date'
import { Button, CourseDot, EmptyState } from '../ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '../../lib/toast'
import { cx } from '../../lib/ui'
const PlateEditor = lazy(() => import('./PlateEditor').then(({ PlateEditor }) => ({ default: PlateEditor })))
import {
  getNoteDisplayTitle,
  getNotePlainText,
  isLectureNote,
  isJsonNote,
  isStudyNote,
  isVeryFirstNote,
  markWelcomeNoteSeen,
  NUDGE_WELCOME_NOTE_JSON,
} from '../../lib/notes'
import { FolderDropdownTree, NoteCard } from './NoteCard'
import { NotePeekModal } from './NotePeekModal'
import { ACADEMIC_TEMPLATES } from '../../lib/academic-templates'
import { generateNoteTitle } from '../../lib/ai/auto-titler'

export type NoteStatusFilter = 'active' | 'reviewed' | 'all'
type NoteTypeFilter = 'all' | NoteType

interface SidebarCreationState {
  courseId: string | null
  parentId: string | null
}

interface RenamingTarget {
  id: string
  source: 'sidebar' | 'gallery'
}

export function Notes({
  selectedNoteId: controlledNoteId,
  onSelectNote,
  onOpenTask,
}: {
  selectedNoteId?: string | null
  onSelectNote?: (id: string | null) => void
  onOpenTask?: (id: string) => void
}) {
  const { toast } = useToast()
  const notes = useStore((s) => s.focusNotes)
  const folders = useStore((s) => s.noteFolders ?? [])
  const allCourses = useStore((s) => s.courses)
  const assignments = useStore((s) => s.assignments)
  const courses = useMemo(() => allCourses.filter((c) => !c.archived), [allCourses])

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const activeNoteId = controlledNoteId !== undefined ? controlledNoteId : internalSelectedId

  const selectNote = useCallback(
    (id: string | null) => {
      if (onSelectNote) onSelectNote(id)
      setInternalSelectedId(id)
    },
    [onSelectNote],
  )

  const [selectedCourseId, setSelectedCourseId] = useState<string>('all')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<NoteStatusFilter>('active')
  const [search, setSearch] = useState('')
  const [filterPinnedOnly, setFilterPinnedOnly] = useState(false)
  const [noteTypeFilter, setNoteTypeFilter] = useState<NoteTypeFilter>('all')

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('nudge.notes.sidebar_open')
      if (saved !== null) return saved === 'true'
    } catch {}
    return typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev
      try {
        localStorage.setItem('nudge.notes.sidebar_open', String(next))
      } catch {}
      return next
    })
  }, [])

  const [expandedCourses, setExpandedCourses] = useState<Record<string, boolean>>({})
  const [expandedGeneral, setExpandedGeneral] = useState(true)
  const [expandedFolderTree, setExpandedFolderTree] = useState<Record<string, boolean>>({})

  const [isCreatingGalleryFolder, setIsCreatingGalleryFolder] = useState(false)
  const [galleryNewFolderName, setGalleryNewFolderName] = useState('')
  const galleryFolderInputRef = useRef<HTMLInputElement>(null)

  const [sidebarCreating, setSidebarCreating] = useState<SidebarCreationState | null>(null)
  const [sidebarNewFolderName, setSidebarNewFolderName] = useState('')

  const [renamingTarget, setRenamingTarget] = useState<RenamingTarget | null>(null)
  const [renamingFolderName, setRenamingFolderName] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameClosedRef = useRef(false)

  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverCourseId, setDragOverCourseId] = useState<string | null>(null)
  const [dragOverGeneral, setDragOverGeneral] = useState(false)
  const draggedItemRef = useRef<{ type: 'note' | 'folder'; id: string } | null>(null)
  const [dragOverBreadcrumbId, setDragOverBreadcrumbId] = useState<string | null>(null)

  const [editorStats, setEditorStats] = useState({ words: 0, chars: 0, readingMin: 1 })
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isAutoTitling, setIsAutoTitling] = useState(false)
  const [peekNoteId, setPeekNoteId] = useState<string | null>(null)

  const [folderDropdownOpen, setFolderDropdownOpen] = useState(false)
  const [isPillCreatingFolder, setIsPillCreatingFolder] = useState(false)
  const [pillNewFolderName, setPillNewFolderName] = useState('')
  const pillFolderInputRef = useRef<HTMLInputElement>(null)
  const [pillExpandedIds, setPillExpandedIds] = useState<Set<string>>(new Set())

  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false)
  const [isMoveCreatingFolder, setIsMoveCreatingFolder] = useState(false)
  const [moveNewFolderName, setMoveNewFolderName] = useState('')
  const moveFolderInputRef = useRef<HTMLInputElement>(null)
  const [moveExpandedIds, setMoveExpandedIds] = useState<Set<string>>(new Set())

  const handleTogglePillExpand = (folderId: string) => {
    setPillExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const handleToggleMoveExpand = (folderId: string) => {
    setMoveExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const coursesMap = useMemo(() => {
    const map = new Map<string, Course>()
    for (const c of courses) map.set(c.id, c)
    return map
  }, [courses])

  const foldersMap = useMemo(() => {
    const map = new Map<string, NoteFolder>()
    for (const f of folders) map.set(f.id, f)
    return map
  }, [folders])

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, NoteFolder[]>()
    for (const folder of folders) {
      const key = folder.parentId ?? null
      const siblings = map.get(key)
      if (siblings) siblings.push(folder)
      else map.set(key, [folder])
    }
    return map
  }, [folders])

  const foldersByCourse = useMemo(() => {
    const map = new Map<string | null, NoteFolder[]>()
    for (const folder of folders) {
      const key = folder.courseId ?? null
      const group = map.get(key)
      if (group) group.push(folder)
      else map.set(key, [folder])
    }
    return map
  }, [folders])

  const isDescendant = useCallback(
    (targetId: string, potentialAncestorId?: string | null): boolean => {
      if (!potentialAncestorId) return false
      if (targetId === potentialAncestorId) return true

      let curr = foldersMap.get(targetId)
      const visited = new Set<string>()
      while (curr && curr.parentId && !visited.has(curr.id)) {
        visited.add(curr.id)
        if (curr.parentId === potentialAncestorId) return true
        curr = foldersMap.get(curr.parentId)
      }
      return false
    },
    [foldersMap],
  )

  const currentFolder = selectedFolderId ? foldersMap.get(selectedFolderId) ?? null : null
  const currentCourse =
    selectedCourseId !== 'all' && selectedCourseId !== 'general'
      ? coursesMap.get(selectedCourseId) ?? null
      : null

  const folderBreadcrumbs = useMemo(() => {
    if (!selectedFolderId) return []
    const crumbs: NoteFolder[] = []
    let curr: NoteFolder | null = foldersMap.get(selectedFolderId) ?? null
    const visited = new Set<string>()
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id)
      crumbs.unshift(curr)
      curr = curr.parentId ? foldersMap.get(curr.parentId) ?? null : null
    }
    return crumbs
  }, [selectedFolderId, foldersMap])

  const currentSubfolders = useMemo(() => {
    const candidates = foldersByParent.get(selectedFolderId ?? null) ?? []
    return candidates
      .filter((f) => {
        if (selectedFolderId || selectedCourseId === 'all') return true
        if (selectedCourseId === 'general') return !f.courseId
        return f.courseId === selectedCourseId
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [foldersByParent, selectedFolderId, selectedCourseId])

  const noteCounts = useMemo(() => {
    const byFolder: Record<string, number> = {}
    const byCourse = new Map<string, number>()
    let pinned = 0
    let general = 0
    let study = 0
    let lecture = 0
    for (const n of notes) {
      if (n.folderId) {
        byFolder[n.folderId] = (byFolder[n.folderId] || 0) + 1
      }
      if (n.isPinned) pinned++
      if (n.courseId) byCourse.set(n.courseId, (byCourse.get(n.courseId) ?? 0) + 1)
      else general++
      if (isStudyNote(n)) study++
      else lecture++
    }
    return { byFolder, byCourse, pinned, general, study, lecture }
  }, [notes])

  const filteredNotes = useMemo(() => {
    return notes
      .filter((note) => {
        if (statusFilter === 'active' && note.reviewedAt) return false
        if (statusFilter === 'reviewed' && !note.reviewedAt) return false
        if (filterPinnedOnly && !note.isPinned) return false
        if (noteTypeFilter === 'study' && !isStudyNote(note)) return false
        if (noteTypeFilter === 'lecture' && !isLectureNote(note)) return false

        if (selectedFolderId) {
          return note.folderId === selectedFolderId
        }

        if (selectedCourseId === 'general') {
          if (note.courseId) return false
        } else if (selectedCourseId !== 'all') {
          if (note.courseId !== selectedCourseId) return false
        }

        if (search.trim()) {
          const q = search.trim().toLowerCase()
          const title = (note.title || '').toLowerCase()
          const plainText = getNotePlainText(note.text).toLowerCase()
          const course = note.courseId ? coursesMap.get(note.courseId) : null
          const courseMatches = course
            ? course.code.toLowerCase().includes(q) || (course.title?.toLowerCase().includes(q) ?? false)
            : false
          if (!title.includes(q) && !plainText.includes(q) && !courseMatches) return false
        }

        return true
      })
      .sort((a, b) => {
        if (Boolean(a.isPinned) !== Boolean(b.isPinned)) {
          return a.isPinned ? -1 : 1
        }
        return +new Date(b.createdAt) - +new Date(a.createdAt)
      })
  }, [notes, statusFilter, filterPinnedOnly, noteTypeFilter, selectedFolderId, selectedCourseId, search, coursesMap])

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === activeNoteId) ?? null,
    [notes, activeNoteId],
  )
  const selectedAssignment = useMemo(
    () => (selectedNote?.assignmentId ? assignments.find((a) => a.id === selectedNote.assignmentId) ?? null : null),
    [assignments, selectedNote],
  )
  const linkableAssignments = useMemo(() => {
    if (!selectedNote) return []
    const available = assignments.filter(
      (assignment) =>
        assignment.status !== 'done' &&
        (!selectedNote.courseId || assignment.courseId === selectedNote.courseId),
    )
    if (selectedAssignment && !available.some((assignment) => assignment.id === selectedAssignment.id)) {
      return [selectedAssignment, ...available]
    }
    return available
  }, [assignments, selectedNote, selectedAssignment])
  const peekNote = useMemo(() => notes.find((n) => n.id === peekNoteId) ?? null, [notes, peekNoteId])

  const handleCreateNewNote = useCallback(
    (templateJson?: string, customTitle?: string, requestedType?: NoteType) => {
      const isFirst = isVeryFirstNote(notes.length)
      if (isFirst) markWelcomeNoteSeen()

      const targetCourseId =
        currentFolder?.courseId ?? (selectedCourseId !== 'all' && selectedCourseId !== 'general' ? selectedCourseId : null)
      const targetFolderId = selectedFolderId

      const content = templateJson || (isFirst ? NUDGE_WELCOME_NOTE_JSON : '')
      const noteType = requestedType ?? (noteTypeFilter === 'study' ? 'study' : 'lecture')
      const note = useStore.getState().addFocusNote({
        title: customTitle,
        text: content,
        noteType,
        courseId: targetCourseId,
        folderId: targetFolderId,
      })

      selectNote(note.id)
      toast('New note created')
    },
    [notes.length, currentFolder?.courseId, selectedCourseId, selectedFolderId, noteTypeFilter, selectNote, toast],
  )

  const saveTimer = useRef<number | null>(null)
  const handleEditorChange = useCallback(
    (newText: string) => {
      if (!activeNoteId) return
      setSaveStatus('saving')
       useStore.getState().updateFocusNoteSilent(activeNoteId, { text: newText })
      setSaveStatus('saved')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        setSaveStatus('idle')
      }, 1200)
    },
    [activeNoteId],
  )

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      useStore.getState().removeFocusNote(noteId)
      if (activeNoteId === noteId) {
        selectNote(null)
      }
      if (peekNoteId === noteId) {
        setPeekNoteId(null)
      }
      toast('Note deleted', {
        action: {
          label: 'Undo',
          run: () => useStore.getState().undo(),
        },
      })
    },
    [activeNoteId, peekNoteId, selectNote, toast],
  )

  const handleMoveNote = useCallback(
    (noteId: string, courseId: string | null, folderId: string | null) => {
      const note = notes.find((n) => n.id === noteId)
      const folderName = folderId ? foldersMap.get(folderId)?.name : null
      const courseName = courseId ? coursesMap.get(courseId)?.code : null
      const destLabel = folderName ? `folder "${folderName}"` : courseName ? `course ${courseName}` : 'General'

      useStore.getState().updateFocusNote(noteId, {
        courseId,
        folderId,
      })

      toast(`Moved "${note ? getNoteDisplayTitle(note) : 'Note'}" to ${destLabel}`, {
        action: {
          label: 'Undo',
          run: () => useStore.getState().undo(),
        },
      })
    },
    [notes, foldersMap, coursesMap, toast],
  )

  const handleMoveFolder = useCallback(
    (folderId: string, targetCourseId: string | null, targetParentId: string | null) => {
      const folder = foldersMap.get(folderId)
      if (!folder || folderId === targetParentId) return

      if (targetParentId && isDescendant(targetParentId, folderId)) {
        toast('Cannot move a folder inside its own subfolder', { tone: 'warn' })
        return
      }

      const targetParent = targetParentId ? foldersMap.get(targetParentId) : null
      const targetCourse = targetCourseId ? coursesMap.get(targetCourseId) : null
      const destName = targetParent ? `folder "${targetParent.name}"` : targetCourse ? targetCourse.code : 'General'

      useStore.getState().moveNoteFolder(folderId, targetCourseId, targetParentId)

      toast(`Moved folder "${folder.name}" to ${destName}`, {
        action: {
          label: 'Undo',
          run: () => useStore.getState().undo(),
        },
      })
    },
    [coursesMap, foldersMap, isDescendant, toast],
  )

  const handleTogglePin = useCallback(
    (noteId: string) => {
      const note = useStore.getState().focusNotes.find((item) => item.id === noteId)
      if (!note) return
      const next = !note.isPinned
      useStore.getState().updateFocusNote(noteId, { isPinned: next })
      toast(next ? 'Note pinned to top' : 'Note unpinned')
    },
    [toast],
  )

  const handleToggleReviewed = useCallback(
    (noteId: string) => {
      const note = useStore.getState().focusNotes.find((item) => item.id === noteId)
      if (!note) return
      const isReviewed = Boolean(note.reviewedAt)
      useStore.getState().markFocusNoteReviewed(noteId, !isReviewed)
       toast(isReviewed ? 'Note marked active' : 'Note reviewed')
    },
    [toast],
  )

  const handleToggleNoteType = useCallback(
    (note: FocusNote) => {
      const nextType: NoteType = isStudyNote(note) ? 'lecture' : 'study'
      useStore.getState().updateFocusNote(note.id, { noteType: nextType })
      toast(nextType === 'study' ? 'Turned into a study note' : 'Turned into a lecture note', {
        action: { label: 'Undo', run: () => useStore.getState().undo() },
      })
    },
    [toast],
  )

  const handleLinkTask = useCallback(
    (assignmentId: string) => {
      if (!selectedNote || assignmentId === selectedNote.assignmentId) return
      useStore.getState().updateFocusNote(selectedNote.id, {
        assignmentId: assignmentId || null,
      })
      toast(assignmentId ? 'Task linked to note' : 'Task unlinked from note', {
        action: { label: 'Undo', run: () => useStore.getState().undo() },
      })
    },
    [selectedNote, toast],
  )

  const handleCopyNote = useCallback(
    (note: FocusNote) => {
      const textToCopy = getNotePlainText(note.text) || (isJsonNote(note.text) ? '' : note.text)
      navigator.clipboard?.writeText(textToCopy)
      toast('Note copied to clipboard')
    },
    [toast],
  )

  const handleConvertToTask = useCallback(
    (note: FocusNote) => {
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
    },
    [onOpenTask, toast],
  )

  const handleAutoTitle = useCallback(
    async (targetNote?: FocusNote) => {
      const noteToTitle = targetNote || selectedNote
      if (!noteToTitle || isAutoTitling) return
      setIsAutoTitling(true)
      try {
        const course = noteToTitle.courseId ? coursesMap.get(noteToTitle.courseId) : null
        const res = await generateNoteTitle({
          text: noteToTitle.text,
          courseCode: course?.code,
        })
        useStore.getState().updateFocusNote(noteToTitle.id, { title: res.title })
        toast(
          res.isLocal
            ? `Title set: "${res.title}"`
            : `Title generated via ${res.model}: "${res.title}"`,
          {
            tone: 'good',
            action: {
              label: 'Undo',
              run: () => useStore.getState().undo(),
            },
          },
        )
      } catch {
        toast('Could not generate title', { tone: 'warn' })
      } finally {
        setIsAutoTitling(false)
      }
    },
    [selectedNote, isAutoTitling, coursesMap, toast],
  )

  const handleCommitGalleryFolder = () => {
    const name = galleryNewFolderName.trim()
    if (name) {
      const targetCourseId =
        currentFolder?.courseId ?? (selectedCourseId !== 'all' && selectedCourseId !== 'general' ? selectedCourseId : null)
      const folder = useStore.getState().addNoteFolder({
        name,
        parentId: selectedFolderId,
        courseId: targetCourseId,
      })
      toast(`Created folder "${folder.name}"`)
    }
    setGalleryNewFolderName('')
    setIsCreatingGalleryFolder(false)
  }

  const handleCommitSidebarFolder = () => {
    if (!sidebarCreating) return
    const name = sidebarNewFolderName.trim()
    if (name) {
      const folder = useStore.getState().addNoteFolder({
        name,
        parentId: sidebarCreating.parentId,
        courseId: sidebarCreating.courseId,
      })
      if (sidebarCreating.parentId) {
        setExpandedFolderTree((p) => ({ ...p, [sidebarCreating.parentId!]: true }))
      }
      toast(`Created folder "${folder.name}"`)
    }
    setSidebarNewFolderName('')
    setSidebarCreating(null)
  }

  const commitRenameFolder = (cancelled = false) => {
    if (!renamingTarget || renameClosedRef.current) return
    renameClosedRef.current = true

    if (!cancelled) {
      const name = renamingFolderName.trim()
      const currentName = foldersMap.get(renamingTarget.id)?.name
      if (name && name !== currentName) {
        useStore.getState().updateNoteFolder(renamingTarget.id, { name })
        toast('Folder renamed')
      }
    }

    setRenamingTarget(null)
    setRenamingFolderName('')
  }

  const beginRenameFolder = (folder: NoteFolder, source: 'sidebar' | 'gallery') => {
    renameClosedRef.current = false
    setRenamingTarget({ id: folder.id, source })
    setRenamingFolderName(folder.name)
    setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 10)
  }

  const handleDeleteFolderDirect = (folder: NoteFolder) => {
    if (renamingTarget?.id === folder.id) {
      commitRenameFolder(true)
    }
    useStore.getState().removeNoteFolder(folder.id)
    if (selectedFolderId === folder.id) {
      setSelectedFolderId(folder.parentId ?? null)
    }
    toast(`Deleted folder "${folder.name}"`, {
      action: {
        label: 'Undo',
        run: () => useStore.getState().undo(),
      },
    })
  }

  const handleCreateFolderFromPill = () => {
    const name = pillNewFolderName.trim()
    if (!name || !selectedNote) return

    const targetCourseId = selectedNote.courseId ?? null
    const store = useStore.getState()
    store.batch(`Created folder "${name}" and moved note`, (s) => {
      const folder = s.addNoteFolder({
        name,
        courseId: targetCourseId,
        parentId: null,
      })
      s.updateFocusNote(selectedNote.id, {
        courseId: targetCourseId,
        folderId: folder.id,
      })
    })

    setPillNewFolderName('')
    setIsPillCreatingFolder(false)
    setFolderDropdownOpen(false)

    toast(`Created folder "${name}" and moved note there`, {
      action: {
        label: 'Undo',
        run: () => useStore.getState().undo(),
      },
    })
  }

  const handleCreateFolderFromMove = () => {
    const name = moveNewFolderName.trim()
    if (!name || !selectedNote) return

    const targetCourseId = selectedNote.courseId ?? null
    const store = useStore.getState()
    store.batch(`Created folder "${name}" and moved note`, (s) => {
      const folder = s.addNoteFolder({
        name,
        courseId: targetCourseId,
        parentId: null,
      })
      s.updateFocusNote(selectedNote.id, {
        courseId: targetCourseId,
        folderId: folder.id,
      })
    })

    setMoveNewFolderName('')
    setIsMoveCreatingFolder(false)
    setMoveDropdownOpen(false)

    toast(`Created folder "${name}" and moved note there`, {
      action: {
        label: 'Undo',
        run: () => useStore.getState().undo(),
      },
    })
  }

  const navigateToAllNotes = () => {
    setSelectedCourseId('all')
    setSelectedFolderId(null)
    setFilterPinnedOnly(false)
    setNoteTypeFilter('all')
    selectNote(null)
  }

  const navigateToCourse = (cId: string) => {
    setSelectedCourseId(cId)
    setSelectedFolderId(null)
    setFilterPinnedOnly(false)
    setNoteTypeFilter('all')
    selectNote(null)
  }

  const navigateToFolder = (fId: string | null) => {
    setSelectedFolderId(fId)
    setFilterPinnedOnly(false)
    setNoteTypeFilter('all')
    selectNote(null)
  }

  const renderFolderBranch = (folder: NoteFolder, depth = 0) => {
    const isSelected = selectedFolderId === folder.id
    const children = foldersByParent.get(folder.id) ?? []
    const hasChildren = children.length > 0
    const isExpanded = expandedFolderTree[folder.id] ?? true
    const noteCount = noteCounts.byFolder[folder.id] || 0
    const isRenaming = renamingTarget?.id === folder.id && renamingTarget.source === 'sidebar'
    const isDropTarget = dragOverFolderId === folder.id

    return (
      <div key={folder.id} className="flex flex-col">
        <div
          draggable={!isRenaming}
          onDragStart={(e) => {
            if (isRenaming) {
              e.preventDefault()
              return
            }
            draggedItemRef.current = { type: 'folder', id: folder.id }
            e.dataTransfer.setData('application/nudge-folder-id', folder.id)
            e.dataTransfer.setData('text/plain', folder.id)
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragEnd={() => {
            draggedItemRef.current = null
            setDragOverFolderId(null)
            setDragOverCourseId(null)
            setDragOverGeneral(false)
            setDragOverBreadcrumbId(null)
          }}
          onClick={() => {
            if (isRenaming) return
            navigateToFolder(folder.id)
            setMobileDrawerOpen(false)
          }}
          onDragOver={(e) => {
            const isFolderDrag = e.dataTransfer.types.includes('application/nudge-folder-id')
            const isNoteDrag = e.dataTransfer.types.includes('application/nudge-note-id')
            if (!isNoteDrag && !isFolderDrag) return
            if (
              isFolderDrag &&
              draggedItemRef.current?.type === 'folder' &&
              (draggedItemRef.current.id === folder.id || isDescendant(folder.id, draggedItemRef.current.id))
            ) {
              return
            }
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setDragOverFolderId(folder.id)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node) && dragOverFolderId === folder.id) {
              setDragOverFolderId(null)
            }
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragOverFolderId(null)
            const noteId = e.dataTransfer.getData('application/nudge-note-id')
            if (noteId) {
              handleMoveNote(noteId, folder.courseId ?? null, folder.id)
              return
            }
            const draggedFolderId = e.dataTransfer.getData('application/nudge-folder-id')
            if (draggedFolderId && draggedFolderId !== folder.id) {
              handleMoveFolder(draggedFolderId, folder.courseId ?? null, folder.id)
            }
          }}
          style={{ paddingLeft: `${depth * 14 + 18}px` }}
          className={cx(
            'group relative flex items-center justify-between py-1.5 pr-2 rounded-lg text-[12px] font-medium transition-all cursor-pointer',
            isSelected
              ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
              : 'text-ink-2 hover:bg-tint hover:text-ink',
            isDropTarget && 'ring-2 ring-[var(--c-accent)] bg-[color-mix(in_srgb,var(--c-accent)_15%,transparent)]',
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setExpandedFolderTree((prev) => ({ ...prev, [folder.id]: !isExpanded }))
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="h-4 w-4 grid place-items-center text-ink-3 hover:text-ink rounded cursor-pointer shrink-0"
              >
                {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            <Folder
              size={14}
              className={cx('shrink-0', isSelected ? 'text-[var(--c-accent)] fill-current' : 'text-ink-3')}
            />

            {isRenaming ? (
              <input
                ref={renameInputRef}
                type="text"
                value={renamingFolderName}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => setRenamingFolderName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitRenameFolder(false)
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    commitRenameFolder(true)
                  }
                }}
                onBlur={() => commitRenameFolder(false)}
                className="h-5 p-0 text-[11.5px] font-medium bg-transparent border-0 border-b border-[var(--c-accent)] rounded-none flex-1 min-w-0 outline-none"
                aria-label="Rename folder"
              />
            ) : (
              <span
                className="truncate"
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  beginRenameFolder(folder, 'sidebar')
                }}
              >
                {folder.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {noteCount > 0 && !isRenaming && (
              <span className="text-[10px] text-ink-3 px-1.5 py-0.2 rounded-full bg-tint/80 tnum">
                {noteCount}
              </span>
            )}

            {!isRenaming && (
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  title="Add subfolder"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSidebarCreating({ courseId: folder.courseId ?? null, parentId: folder.id })
                    setSidebarNewFolderName('')
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-5 w-5 grid place-items-center rounded hover:bg-tint text-ink-3 hover:text-ink cursor-pointer"
                >
                  <Plus size={11} />
                </button>
                <button
                  type="button"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation()
                    beginRenameFolder(folder, 'sidebar')
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-5 w-5 grid place-items-center rounded hover:bg-tint text-ink-3 hover:text-ink cursor-pointer"
                >
                  <Edit2 size={11} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDeleteFolderDirect(folder)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-5 w-5 grid place-items-center rounded hover:bg-tint text-ink-3 hover:text-[var(--c-critical-ink)] cursor-pointer"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        </div>

        {}
        {sidebarCreating?.parentId === folder.id && (
          <div
            style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}
            className="py-1 pr-2 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Folder size={14} className="text-[var(--c-accent)] shrink-0" />
            <input
              type="text"
              autoFocus
              placeholder="Subfolder name…"
              value={sidebarNewFolderName}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) => setSidebarNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleCommitSidebarFolder()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setSidebarCreating(null)
                }
              }}
              onBlur={handleCommitSidebarFolder}
              className="h-5 p-0 text-[11.5px] font-medium bg-transparent border-0 border-b border-[var(--c-accent)] flex-1 min-w-0 outline-none"
            />
          </div>
        )}

        {hasChildren && isExpanded && (
          <div className="flex flex-col">
            {children.map((child) => renderFolderBranch(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const sidebarContent = (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto px-2.5 py-3 space-y-4 scroll-slim select-none">
      {}
      <div className="space-y-0.5">
        <button
          type="button"
          onClick={() => {
            navigateToAllNotes()
            setMobileDrawerOpen(false)
          }}
          className={cx(
            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer',
            selectedCourseId === 'all' && selectedFolderId === null && !filterPinnedOnly && noteTypeFilter === 'all'
              ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
              : 'text-ink-2 hover:bg-tint hover:text-ink',
          )}
        >
          <div className="flex items-center gap-2">
            <StickyNote size={14} className="text-ink-3" />
            <span>All Notes</span>
          </div>
          <span className="text-[10.5px] text-ink-3 tnum">{notes.length}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedCourseId('all')
            setSelectedFolderId(null)
            setFilterPinnedOnly(false)
            setNoteTypeFilter('study')
            selectNote(null)
            setMobileDrawerOpen(false)
          }}
          className={cx(
            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer',
            noteTypeFilter === 'study'
              ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
              : 'text-ink-2 hover:bg-tint hover:text-ink',
          )}
        >
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-ink-3" />
            <span>Study notes</span>
          </div>
          <span className="text-[10.5px] text-ink-3 tnum">{noteCounts.study}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedCourseId('all')
            setSelectedFolderId(null)
            setFilterPinnedOnly(false)
            setNoteTypeFilter('lecture')
            selectNote(null)
            setMobileDrawerOpen(false)
          }}
          className={cx(
            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer',
            noteTypeFilter === 'lecture'
              ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
              : 'text-ink-2 hover:bg-tint hover:text-ink',
          )}
        >
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-ink-3" />
            <span>Lecture notes</span>
          </div>
          <span className="text-[10.5px] text-ink-3 tnum">{noteCounts.lecture}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setFilterPinnedOnly(true)
            setNoteTypeFilter('all')
            setSelectedFolderId(null)
            selectNote(null)
            setMobileDrawerOpen(false)
          }}
          className={cx(
            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer',
            filterPinnedOnly
              ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
              : 'text-ink-2 hover:bg-tint hover:text-ink',
          )}
        >
          <div className="flex items-center gap-2">
            <Pin size={14} className="text-ink-3 rotate-45" />
            <span>Pinned</span>
          </div>
          <span className="text-[10.5px] text-ink-3 tnum">{noteCounts.pinned}</span>
        </button>
      </div>

      {}
      <div className="space-y-1">
        <div className="px-2 pb-1 text-[10.5px] font-bold text-ink-3 uppercase tracking-wider">
           Courses
        </div>

        {courses.map((course) => {
          const isSelected = selectedCourseId === course.id && selectedFolderId === null
          const courseNotesCount = noteCounts.byCourse.get(course.id) ?? 0
          const courseRootFolders = (foldersByParent.get(null) ?? []).filter((f) => f.courseId === course.id)
          const isExpanded = expandedCourses[course.id] ?? true
          const isDropTarget = dragOverCourseId === course.id

          return (
            <div key={course.id} className="flex flex-col">
              {}
              <div
                onClick={() => {
                  navigateToCourse(course.id)
                  setMobileDrawerOpen(false)
                }}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes('application/nudge-note-id') ||
                    e.dataTransfer.types.includes('application/nudge-folder-id')
                  ) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverCourseId(course.id)
                  }
                }}
                onDragLeave={() => {
                  if (dragOverCourseId === course.id) setDragOverCourseId(null)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverCourseId(null)
                  const noteId = e.dataTransfer.getData('application/nudge-note-id')
                  if (noteId) {
                    handleMoveNote(noteId, course.id, null)
                    return
                  }
                  const folderId = e.dataTransfer.getData('application/nudge-folder-id')
                  if (folderId) {
                    handleMoveFolder(folderId, course.id, null)
                  }
                }}
                className={cx(
                  'group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all cursor-pointer',
                  isSelected
                    ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
                    : 'text-ink-2 hover:bg-tint hover:text-ink',
                  isDropTarget && 'ring-2 ring-[var(--c-accent)] bg-[color-mix(in_srgb,var(--c-accent)_15%,transparent)]',
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  {courseRootFolders.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedCourses((prev) => ({ ...prev, [course.id]: !isExpanded }))
                      }}
                      className="h-4 w-4 grid place-items-center text-ink-3 hover:text-ink rounded cursor-pointer"
                    >
                      {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                  ) : (
                    <span className="w-2" />
                  )}

                  <CourseDot course={course} size={15} />
                  <span className="truncate font-semibold">{course.code}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-ink-3 tnum">{courseNotesCount}</span>

                  <button
                    type="button"
                    title={`Add folder to ${course.code}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSidebarCreating({ courseId: course.id, parentId: null })
                      setSidebarNewFolderName('')
                      setExpandedCourses((p) => ({ ...p, [course.id]: true }))
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="opacity-0 group-hover:opacity-100 h-5 w-5 grid place-items-center rounded hover:bg-tint text-ink-3 hover:text-ink cursor-pointer transition-opacity"
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </div>

              {}
              {sidebarCreating?.courseId === course.id && !sidebarCreating.parentId && (
                <div
                  className="pl-6 pr-2 py-1 flex items-center gap-1.5"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <Folder size={14} className="text-[var(--c-accent)] shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    placeholder={`Folder in ${course.code}…`}
                    value={sidebarNewFolderName}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => setSidebarNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation()
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleCommitSidebarFolder()
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault()
                        setSidebarCreating(null)
                      }
                    }}
                    onBlur={handleCommitSidebarFolder}
                    className="h-5 p-0 text-[11.5px] font-medium bg-transparent border-0 border-b border-[var(--c-accent)] flex-1 min-w-0 outline-none"
                  />
                </div>
              )}

              {}
              {isExpanded && courseRootFolders.length > 0 && (
                <div className="flex flex-col">
                  {courseRootFolders.map((f) => renderFolderBranch(f, 0))}
                </div>
              )}
            </div>
          )
        })}

        {}
        <div className="flex flex-col pt-1">
          {(() => {
            const isSelected = selectedCourseId === 'general' && selectedFolderId === null
            const generalNotesCount = noteCounts.general
            const generalRootFolders = (foldersByParent.get(null) ?? []).filter((f) => !f.courseId)
            const isDropTarget = dragOverGeneral

            return (
              <>
                <div
                  onClick={() => {
                    setSelectedCourseId('general')
                    setSelectedFolderId(null)
                    setFilterPinnedOnly(false)
                    selectNote(null)
                    setMobileDrawerOpen(false)
                  }}
                  onDragOver={(e) => {
                    if (
                      e.dataTransfer.types.includes('application/nudge-note-id') ||
                      e.dataTransfer.types.includes('application/nudge-folder-id')
                    ) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverGeneral(true)
                    }
                  }}
                  onDragLeave={() => setDragOverGeneral(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverGeneral(false)
                    const noteId = e.dataTransfer.getData('application/nudge-note-id')
                    if (noteId) {
                      handleMoveNote(noteId, null, null)
                      return
                    }
                    const folderId = e.dataTransfer.getData('application/nudge-folder-id')
                    if (folderId) {
                      handleMoveFolder(folderId, null, null)
                    }
                  }}
                  className={cx(
                    'group relative flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-all cursor-pointer',
                    isSelected
                      ? 'bg-[color-mix(in_srgb,var(--c-accent)_12%,transparent)] text-[var(--c-accent)] font-semibold'
                      : 'text-ink-2 hover:bg-tint hover:text-ink',
                    isDropTarget && 'ring-2 ring-[var(--c-accent)] bg-[color-mix(in_srgb,var(--c-accent)_15%,transparent)]',
                  )}
                >
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {generalRootFolders.length > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setExpandedGeneral((prev) => !prev)
                        }}
                        className="h-4 w-4 grid place-items-center text-ink-3 hover:text-ink rounded cursor-pointer"
                      >
                        {expandedGeneral ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      </button>
                    ) : (
                      <span className="w-2" />
                    )}

                    <FileText size={13} className="text-ink-3 shrink-0" />
                    <span className="truncate font-semibold">General</span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-ink-3 tnum">{generalNotesCount}</span>

                    <button
                      type="button"
                      title="Add general folder"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSidebarCreating({ courseId: null, parentId: null })
                        setSidebarNewFolderName('')
                        setExpandedGeneral(true)
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="opacity-0 group-hover:opacity-100 h-5 w-5 grid place-items-center rounded hover:bg-tint text-ink-3 hover:text-ink cursor-pointer transition-opacity"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>

                {}
                {sidebarCreating?.courseId === null && !sidebarCreating.parentId && (
                  <div
                    className="pl-6 pr-2 py-1 flex items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <Folder size={14} className="text-[var(--c-accent)] shrink-0" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Folder in General…"
                      value={sidebarNewFolderName}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => setSidebarNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleCommitSidebarFolder()
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          setSidebarCreating(null)
                        }
                      }}
                      onBlur={handleCommitSidebarFolder}
                      className="h-5 p-0 text-[11.5px] font-medium bg-transparent border-0 border-b border-[var(--c-accent)] flex-1 min-w-0 outline-none"
                    />
                  </div>
                )}

                {}
                {expandedGeneral && generalRootFolders.length > 0 && (
                  <div className="flex flex-col">
                    {generalRootFolders.map((f) => renderFolderBranch(f, 0))}
                  </div>
                )}
              </>
            )
          })()}
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex-1 h-full min-h-0 flex flex-col overflow-hidden bg-bg">
      {}
      <div className="h-13 px-4 sm:px-6 border-b border-line shrink-0 flex items-center justify-between gap-3 bg-surface z-10">
        {}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            title="Open menu"
            className="md:hidden h-8 w-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-tint cursor-pointer shrink-0"
          >
            <Menu size={18} />
          </button>

          {}
          <button
            type="button"
            onClick={toggleSidebar}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            className="hidden md:grid h-8 w-8 rounded-lg place-items-center text-ink-3 hover:text-ink hover:bg-tint transition-colors cursor-pointer shrink-0"
          >
            <PanelLeft size={16} />
          </button>

          {selectedNote ? (

            <>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => selectNote(null)}
                className="h-8 gap-1.5 px-2.5 text-[12.5px] font-medium text-ink hover:text-ink shrink-0 cursor-pointer"
                title="Back to gallery view"
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </Button>

              <span className="text-line-2 hidden sm:inline">|</span>

              {}
              <div className="flex items-center gap-1.5 text-[12px] min-w-0 truncate">
                {}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-ink-2 font-medium bg-sunken/60 hover:bg-sunken px-2 py-0.5 rounded-md truncate cursor-pointer transition-colors"
                      title="Reassign course"
                    >
                      {selectedNote.courseId ? (
                        <>
                          <CourseDot course={coursesMap.get(selectedNote.courseId)} size={14} />
                          <span>{coursesMap.get(selectedNote.courseId)?.code}</span>
                        </>
                      ) : (
                        <span>General</span>
                      )}
                      <ChevronDown size={11} className="text-ink-3 ml-0.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => handleMoveNote(selectedNote.id, null, selectedNote.folderId ?? null)}>
                      <span>General (No course)</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {courses.map((c) => (
                      <DropdownMenuItem
                        key={c.id}
                        onClick={() => handleMoveNote(selectedNote.id, c.id, selectedNote.folderId ?? null)}
                      >
                        <CourseDot course={c} size={15} className="mr-2" />
                        <span>{c.code}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <span className="text-ink-3">/</span>

                {}
                {(() => {
                  const relevantFolders = foldersByCourse.get(selectedNote.courseId ?? null) ?? []

                  return (
                    <DropdownMenu
                      open={folderDropdownOpen}
                      modal={false}
                      onOpenChange={(open) => {
                        setFolderDropdownOpen(open)
                        if (open) {
                          const ancestors = new Set<string>()
                          let curr = selectedNote.folderId ? foldersMap.get(selectedNote.folderId) : null
                          while (curr && curr.parentId) {
                            ancestors.add(curr.parentId)
                            curr = foldersMap.get(curr.parentId)
                          }
                          setPillExpandedIds(ancestors)

                          if (relevantFolders.length === 0) {
                            setIsPillCreatingFolder(true)
                            setTimeout(() => pillFolderInputRef.current?.focus(), 50)
                          }
                        } else {
                          setIsPillCreatingFolder(false)
                          setPillNewFolderName('')
                        }
                      }}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-ink-2 font-medium bg-sunken/60 hover:bg-sunken px-2 py-0.5 rounded-md truncate max-w-[150px] cursor-pointer transition-colors"
                          title="Change or create folder"
                        >
                          <Folder
                            size={13}
                            className={cx(
                              'shrink-0',
                              selectedNote.folderId ? 'text-[var(--c-accent)]' : 'text-ink-3',
                            )}
                          />
                          <span className="truncate">
                            {selectedNote.folderId ? foldersMap.get(selectedNote.folderId)?.name ?? 'Folder' : 'No folder'}
                          </span>
                          <ChevronDown size={11} className="text-ink-3 ml-0.5 shrink-0" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-56 p-1"
                        onCloseAutoFocus={(e) => e.preventDefault()}
                        onPointerDownOutside={(e) => {
                          const originalTarget = e.detail.originalEvent.target as HTMLElement | null
                          if (
                            originalTarget?.closest?.(
                              '[data-slot="dropdown-menu-trigger"], [data-radix-dropdown-menu-trigger]',
                            )
                          ) {
                            e.preventDefault()
                          }
                        }}
                      >
                        <div className="px-2 py-1 text-[10px] font-bold text-ink-3 uppercase tracking-wider">
                          {selectedNote.courseId
                            ? `${coursesMap.get(selectedNote.courseId)?.code ?? 'Course'} Folders`
                            : 'General Folders'}
                        </div>

                        <DropdownMenuItem onClick={() => handleMoveNote(selectedNote.id, selectedNote.courseId ?? null, null)}>
                          <span className={!selectedNote.folderId ? 'font-semibold text-ink' : 'text-ink-2'}>
                            No folder (Root)
                          </span>
                          {!selectedNote.folderId && <Check size={12} className="ml-auto text-[var(--c-good)]" />}
                        </DropdownMenuItem>

                        {relevantFolders.length > 0 && (
                          <>
                            <DropdownMenuSeparator />
                            <div className="max-h-52 overflow-y-auto space-y-0.5">
                              <FolderDropdownTree
                                folders={relevantFolders}
                                currentFolderId={selectedNote.folderId}
                                expandedIds={pillExpandedIds}
                                onToggleExpand={handleTogglePillExpand}
                                onSelectFolder={(f) => handleMoveNote(selectedNote.id, selectedNote.courseId ?? null, f.id)}
                              />
                            </div>
                          </>
                        )}

                        <DropdownMenuSeparator />

                        {}
                        <div
                          className="p-1"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {isPillCreatingFolder ? (
                            <div
                              className="flex items-center gap-1.5 p-1 bg-surface"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <Folder size={14} className="text-[var(--c-accent)] shrink-0 ml-1" />
                              <input
                                ref={pillFolderInputRef}
                                type="text"
                                autoFocus
                                placeholder="New folder name…"
                                value={pillNewFolderName}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setPillNewFolderName(e.target.value)}
                                onKeyDown={(e) => {
                                  e.stopPropagation()
                                  if (e.key === 'Enter') {
                                    e.preventDefault()
                                    handleCreateFolderFromPill()
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault()
                                    setIsPillCreatingFolder(false)
                                    setPillNewFolderName('')
                                  }
                                }}
                                className="w-full p-0 text-[12px] font-medium text-ink bg-transparent border-0 border-b border-[var(--c-accent)] outline-none"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleCreateFolderFromPill()
                                }}
                                disabled={!pillNewFolderName.trim()}
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
                                setIsPillCreatingFolder(true)
                                setTimeout(() => pillFolderInputRef.current?.focus(), 50)
                              }}
                              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-[var(--c-accent)] hover:bg-tint rounded-md transition-colors cursor-pointer text-left"
                            >
                              <Plus size={13} />
                              <span>New folder…</span>
                            </button>
                          )}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )
                })()}
              </div>
            </>
          ) : (

            <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink min-w-0">
              <button
                type="button"
                onClick={navigateToAllNotes}
                onDragOver={(e) => {
                  if (
                    e.dataTransfer.types.includes('application/nudge-note-id') ||
                    e.dataTransfer.types.includes('application/nudge-folder-id')
                  ) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDragOverBreadcrumbId('all')
                  }
                }}
                onDragLeave={() => setDragOverBreadcrumbId(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverBreadcrumbId(null)
                  const noteId = e.dataTransfer.getData('application/nudge-note-id')
                  if (noteId) {
                    handleMoveNote(noteId, null, null)
                    return
                  }
                  const folderId = e.dataTransfer.getData('application/nudge-folder-id')
                  if (folderId) handleMoveFolder(folderId, null, null)
                }}
                className={cx(
                  'px-1.5 py-0.5 rounded-md hover:opacity-80 transition-all cursor-pointer truncate',
                  selectedCourseId === 'all' && selectedFolderId === null && 'text-[var(--c-accent)]',
                  dragOverBreadcrumbId === 'all' && 'bg-tint text-[var(--c-accent)] ring-1 ring-[var(--c-accent)]',
                )}
              >
                Notes
              </button>

              {currentCourse && (
                <>
                  <span className="text-ink-3 font-normal">/</span>
                  <button
                    type="button"
                    onClick={() => navigateToCourse(currentCourse.id)}
                    onDragOver={(e) => {
                      if (
                        e.dataTransfer.types.includes('application/nudge-note-id') ||
                        e.dataTransfer.types.includes('application/nudge-folder-id')
                      ) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverBreadcrumbId(`course-${currentCourse.id}`)
                      }
                    }}
                    onDragLeave={() => setDragOverBreadcrumbId(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverBreadcrumbId(null)
                      const noteId = e.dataTransfer.getData('application/nudge-note-id')
                      if (noteId) {
                        handleMoveNote(noteId, currentCourse.id, null)
                        return
                      }
                      const folderId = e.dataTransfer.getData('application/nudge-folder-id')
                      if (folderId) handleMoveFolder(folderId, currentCourse.id, null)
                    }}
                    className={cx(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:opacity-80 transition-all cursor-pointer truncate',
                      selectedFolderId === null && 'text-[var(--c-accent)]',
                      dragOverBreadcrumbId === `course-${currentCourse.id}` &&
                        'bg-tint text-[var(--c-accent)] ring-1 ring-[var(--c-accent)]',
                    )}
                  >
                    <CourseDot course={currentCourse} size={15} />
                    <span>{currentCourse.code}</span>
                  </button>
                </>
              )}

              {selectedCourseId === 'general' && (
                <>
                  <span className="text-ink-3 font-normal">/</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCourseId('general')
                      setSelectedFolderId(null)
                    }}
                    onDragOver={(e) => {
                      if (
                        e.dataTransfer.types.includes('application/nudge-note-id') ||
                        e.dataTransfer.types.includes('application/nudge-folder-id')
                      ) {
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        setDragOverBreadcrumbId('general')
                      }
                    }}
                    onDragLeave={() => setDragOverBreadcrumbId(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverBreadcrumbId(null)
                      const noteId = e.dataTransfer.getData('application/nudge-note-id')
                      if (noteId) {
                        handleMoveNote(noteId, null, null)
                        return
                      }
                      const folderId = e.dataTransfer.getData('application/nudge-folder-id')
                      if (folderId) handleMoveFolder(folderId, null, null)
                    }}
                    className={cx(
                      'px-1.5 py-0.5 rounded-md hover:opacity-80 transition-all cursor-pointer truncate',
                      selectedFolderId === null && 'text-[var(--c-accent)]',
                      dragOverBreadcrumbId === 'general' &&
                        'bg-tint text-[var(--c-accent)] ring-1 ring-[var(--c-accent)]',
                    )}
                  >
                    General
                  </button>
                </>
              )}

              {folderBreadcrumbs.map((crumb, i) => (
                <div key={crumb.id} className="flex items-center gap-1.5 truncate">
                  <span className="text-ink-3 font-normal">/</span>
                  <button
                    type="button"
                    onClick={() => navigateToFolder(crumb.id)}
                    onDragOver={(e) => {
                      const isFolderDrag = e.dataTransfer.types.includes('application/nudge-folder-id')
                      const isNoteDrag = e.dataTransfer.types.includes('application/nudge-note-id')
                      if (!isNoteDrag && !isFolderDrag) return
                      if (
                        isFolderDrag &&
                        draggedItemRef.current?.type === 'folder' &&
                        (draggedItemRef.current.id === crumb.id ||
                          isDescendant(crumb.id, draggedItemRef.current.id))
                      ) {
                        return
                      }
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      setDragOverBreadcrumbId(`folder-${crumb.id}`)
                    }}
                    onDragLeave={() => setDragOverBreadcrumbId(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDragOverBreadcrumbId(null)
                      const noteId = e.dataTransfer.getData('application/nudge-note-id')
                      if (noteId) {
                        handleMoveNote(noteId, crumb.courseId ?? null, crumb.id)
                        return
                      }
                      const folderId = e.dataTransfer.getData('application/nudge-folder-id')
                      if (folderId && folderId !== crumb.id) {
                        handleMoveFolder(folderId, crumb.courseId ?? null, crumb.id)
                      }
                    }}
                    className={cx(
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:opacity-80 transition-all cursor-pointer truncate max-w-[130px]',
                      i === folderBreadcrumbs.length - 1 && 'text-[var(--c-accent)]',
                      dragOverBreadcrumbId === `folder-${crumb.id}` &&
                        'bg-tint text-[var(--c-accent)] ring-1 ring-[var(--c-accent)]',
                    )}
                  >
                    <Folder size={14} className="text-ink-3 shrink-0" />
                    <span className="truncate">{crumb.name}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedNote ? (

          <div className="flex items-center gap-2 shrink-0">
            {saveStatus === 'saving' && (
              <span className="text-[11px] text-ink-3 italic mr-1">Saving…</span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[11px] text-[var(--c-good)] mr-1 flex items-center gap-1 font-medium">
                <Check size={11} /> Saved
              </span>
            )}

            <button
              type="button"
              onClick={() => handleToggleNoteType(selectedNote)}
              title="Toggle note type"
              className={cx(
                'h-8 px-2.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer border',
                isStudyNote(selectedNote)
                  ? 'bg-[color-mix(in_srgb,var(--c-accent)_10%,transparent)] text-[var(--c-accent)] border-[color-mix(in_srgb,var(--c-accent)_25%,transparent)]'
                  : 'bg-surface text-ink-2 border-line hover:border-line-2',
              )}
            >
              {isStudyNote(selectedNote) ? 'Study note ▾' : 'Lecture note ▾'}
            </button>

             <label className="h-8 max-w-[220px] inline-flex items-center gap-1.5 px-2 rounded-lg border border-line bg-surface text-ink-2 focus-within:border-line-2">
               <ListTodo size={13} className="shrink-0 text-ink-3" />
               <span className="sr-only">Link note to task</span>
               <select
                 aria-label="Link note to task"
                 value={selectedNote.assignmentId ?? ''}
                 onChange={(e) => handleLinkTask(e.target.value)}
                 className="min-w-0 max-w-[180px] bg-transparent text-[11px] font-medium outline-none cursor-pointer"
               >
                 <option value="">Link to task…</option>
                 {linkableAssignments.map((assignment) => (
                   <option key={assignment.id} value={assignment.id}>
                     {assignment.title}
                     {assignment.status === 'done' ? ' (completed)' : ''}
                   </option>
                 ))}
               </select>
             </label>

            {}
            <DropdownMenu
              open={moveDropdownOpen}
              modal={false}
              onOpenChange={(open) => {
                setMoveDropdownOpen(open)
                if (open) {
                  const ancestors = new Set<string>()
                  let curr = selectedNote.folderId ? foldersMap.get(selectedNote.folderId) : null
                  while (curr && curr.parentId) {
                    ancestors.add(curr.parentId)
                    curr = foldersMap.get(curr.parentId)
                  }
                  setMoveExpandedIds(ancestors)
                } else {
                  setIsMoveCreatingFolder(false)
                  setMoveNewFolderName('')
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="quiet"
                  className="h-8 text-[12px] gap-1 px-2.5 text-ink-2 hover:text-ink cursor-pointer"
                  title="Move note"
                >
                  <FolderInput size={13} />
                  <span className="hidden sm:inline">Move</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 p-1"
                onCloseAutoFocus={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => {
                  const originalTarget = e.detail.originalEvent.target as HTMLElement | null
                  if (
                    originalTarget?.closest?.(
                      '[data-slot="dropdown-menu-trigger"], [data-radix-dropdown-menu-trigger]',
                    )
                  ) {
                    e.preventDefault()
                  }
                }}
              >
                <div className="px-2 py-1 text-[10px] font-bold text-ink-3 uppercase tracking-wider">Move to</div>
                <div className="max-h-64 overflow-y-auto space-y-0.5">
                  <DropdownMenuItem onClick={() => handleMoveNote(selectedNote.id, null, null)}>
                    <FileText size={13} className="mr-2 text-ink-3" />
                    <span>General (Root)</span>
                  </DropdownMenuItem>

                  {}
                  {(() => {
                    const generalFolders = foldersByCourse.get(null) ?? []
                    return (
                      <FolderDropdownTree
                        folders={generalFolders}
                        currentFolderId={selectedNote.folderId}
                        expandedIds={moveExpandedIds}
                        onToggleExpand={handleToggleMoveExpand}
                        onSelectFolder={(f) => handleMoveNote(selectedNote.id, null, f.id)}
                        depth={1}
                      />
                    )
                  })()}

                  {courses.map((c) => {
                    const courseFolders = foldersByCourse.get(c.id) ?? []
                    return (
                      <div key={c.id}>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleMoveNote(selectedNote.id, c.id, null)}>
                          <CourseDot course={c} size={15} className="mr-2" />
                          <span className="font-semibold">{c.code} (Root)</span>
                        </DropdownMenuItem>
                        {courseFolders.length > 0 && (
                          <FolderDropdownTree
                            folders={courseFolders}
                            currentFolderId={selectedNote.folderId}
                            expandedIds={moveExpandedIds}
                            onToggleExpand={handleToggleMoveExpand}
                            onSelectFolder={(f) => handleMoveNote(selectedNote.id, c.id, f.id)}
                            depth={1}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>

                <DropdownMenuSeparator />

                {}
                <div
                  className="p-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {isMoveCreatingFolder ? (
                    <div
                      className="flex items-center gap-1.5 p-1 bg-surface"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Folder size={14} className="text-[var(--c-accent)] shrink-0 ml-1" />
                      <input
                        ref={moveFolderInputRef}
                        type="text"
                        autoFocus
                        placeholder="New folder name…"
                        value={moveNewFolderName}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setMoveNewFolderName(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleCreateFolderFromMove()
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault()
                            setIsMoveCreatingFolder(false)
                            setMoveNewFolderName('')
                          }
                        }}
                        className="w-full p-0 text-[12px] font-medium text-ink bg-transparent border-0 border-b border-[var(--c-accent)] outline-none"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCreateFolderFromMove()
                        }}
                        disabled={!moveNewFolderName.trim()}
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
                        setIsMoveCreatingFolder(true)
                        setTimeout(() => moveFolderInputRef.current?.focus(), 50)
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[12px] font-medium text-[var(--c-accent)] hover:bg-tint rounded-md transition-colors cursor-pointer text-left"
                    >
                      <Plus size={13} />
                      <span>New folder…</span>
                    </button>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {}
            <Button
              size="sm"
              variant="quiet"
              onClick={() => handleAutoTitle(selectedNote)}
              disabled={isAutoTitling}
              className="h-8 text-[12px] gap-1 px-2.5 text-[var(--c-accent)] hover:text-[var(--c-accent)] cursor-pointer"
              title="Generate title with AI"
            >
              <Sparkles size={13} className={isAutoTitling ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Auto-title</span>
            </Button>

            {}
            <Button
              size="sm"
              variant="quiet"
              onClick={() => handleTogglePin(selectedNote.id)}
              className={cx('h-8 w-8 p-0 justify-center cursor-pointer', selectedNote.isPinned && 'text-[var(--c-accent)]')}
              title={selectedNote.isPinned ? 'Unpin note' : 'Pin note'}
            >
              <Pin size={14} className={selectedNote.isPinned ? 'fill-current rotate-45' : ''} />
            </Button>

            {}
            <button
              type="button"
              onClick={() => handleToggleReviewed(selectedNote.id)}
              className={cx(
                'h-8 px-2.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer border',
                selectedNote.reviewedAt
                  ? 'bg-[var(--c-good-tint)] text-[var(--c-good)] border-[var(--c-good)]/30 font-semibold'
                  : 'bg-surface text-ink-3 hover:text-ink border-line hover:border-line-2',
              )}
            >
              <Check size={12} strokeWidth={2.5} />
              <span className="hidden sm:inline">
                 {selectedNote.reviewedAt ? 'Reviewed' : 'Active'}
              </span>
            </button>

            {}
            <Button
              size="sm"
              variant="quiet"
              onClick={() => handleDeleteNote(selectedNote.id)}
              className="h-8 w-8 p-0 justify-center text-ink-3 hover:text-[var(--c-critical-ink)] cursor-pointer"
              title="Delete note"
            >
              <Trash2 size={14} />
            </Button>

            {}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Note options"
                  className="h-8 w-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink hover:bg-tint transition-colors cursor-pointer"
                >
                  <MoreHorizontal size={15} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => handleCopyNote(selectedNote)}>
                  <Copy size={14} className="mr-2" />
                  <span>Copy text</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleToggleNoteType(selectedNote)}>
                  {isStudyNote(selectedNote) ? <FileText size={14} className="mr-2" /> : <Clock size={14} className="mr-2" />}
                  <span>{isStudyNote(selectedNote) ? 'Turn into lecture note' : 'Turn into study note'}</span>
                </DropdownMenuItem>
                {!selectedNote.assignmentId && (
                  <DropdownMenuItem onClick={() => handleConvertToTask(selectedNote)}>
                    <ListTodo size={14} className="mr-2" />
                    <span>Convert to task</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (

          <div className="flex items-center gap-2 shrink-0">
            {}
            <div className="relative hidden sm:block w-40 lg:w-52">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes…"
                className="w-full h-8 pl-8 pr-7 text-[12px] bg-sunken/50 rounded-lg border border-line/50 focus:border-ink/40 focus:bg-surface transition-colors outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {}
             <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-sunken/50 border border-line/40">
               {([
                 ['all', 'All'],
                 ['lecture', 'Lecture'],
                 ['study', 'Study'],
               ] as const).map(([value, label]) => (
                 <button
                   key={value}
                   type="button"
                   onClick={() => setNoteTypeFilter(value)}
                   className={cx(
                     'h-7 px-2.5 text-[11.5px] font-medium rounded-md transition-colors cursor-pointer',
                     noteTypeFilter === value
                       ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)]'
                       : 'text-ink-3 hover:text-ink-2',
                   )}
                 >
                   {label}
                 </button>
               ))}
             </div>

             <div className="hidden sm:flex items-center p-0.5 rounded-lg bg-sunken/50 border border-line/40">
              {(['active', 'reviewed', 'all'] as NoteStatusFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={cx(
                    'h-7 px-2.5 text-[11.5px] font-medium rounded-md capitalize transition-colors cursor-pointer',
                    statusFilter === f
                      ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(0,0,0,.06)]'
                      : 'text-ink-3 hover:text-ink-2',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>

            {}
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setIsCreatingGalleryFolder(true)
                setTimeout(() => galleryFolderInputRef.current?.focus(), 50)
              }}
              className="h-8 text-[12px] gap-1 px-2.5 text-ink-2 hover:text-ink cursor-pointer"
              title="Create folder inline"
            >
              <FolderPlus size={14} />
              <span className="hidden sm:inline">New Folder</span>
            </Button>

            {}
            <DropdownMenu>
              <div className="flex items-center rounded-lg bg-[var(--c-accent)] text-white overflow-hidden">
                <button
                  type="button"
                   onClick={() => handleCreateNewNote(undefined, undefined, noteTypeFilter === 'study' ? 'study' : 'lecture')}
                  className="h-8 px-3 text-[12px] font-semibold flex items-center gap-1.5 hover:bg-white/10 transition-colors cursor-pointer border-0 outline-none"
                >
                  <Plus size={14} />
                   <span>{noteTypeFilter === 'study' ? 'Study Note' : 'New Note'}</span>
                </button>
                <div className="w-px self-stretch bg-white/20 shrink-0" />
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title="Templates"
                    className="h-8 px-1.5 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer border-0 outline-none"
                  >
                    <ChevronDown size={12} />
                  </button>
                </DropdownMenuTrigger>
              </div>
              <DropdownMenuContent align="end" className="w-52">
                 <DropdownMenuItem onClick={() => handleCreateNewNote(undefined, undefined, 'lecture')}>
                   <FileText size={14} className="mr-2" />
                   <span>Lecture Note</span>
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={() => handleCreateNewNote(undefined, undefined, 'study')}>
                   <Clock size={14} className="mr-2" />
                   <span>Study Note</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {ACADEMIC_TEMPLATES.map((tmpl) => (
                  <DropdownMenuItem
                    key={tmpl.id}
                     onClick={() => handleCreateNewNote(tmpl.jsonContent, tmpl.name, tmpl.noteType)}
                  >
                    <span className="truncate">{tmpl.name} · {tmpl.noteType === 'study' ? 'Study' : 'Lecture'}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {}
        {sidebarOpen && (
          <aside className="hidden md:flex w-[220px] shrink-0 border-r border-line bg-surface flex-col h-full min-h-0 overflow-hidden select-none">
            {sidebarContent}
          </aside>
        )}

        {}
        {mobileDrawerOpen && (
          <div
            className="md:hidden fixed inset-0 z-50 flex bg-black/40 backdrop-blur-xs"
            onClick={() => setMobileDrawerOpen(false)}
          >
            <div
              className="w-72 max-w-[85vw] h-full bg-surface border-r border-line shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-13 px-4 border-b border-line flex items-center justify-between shrink-0">
                 <span className="font-semibold text-[14px] text-ink">Courses</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  className="h-8 w-8 rounded-lg grid place-items-center text-ink-3 hover:text-ink cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              {sidebarContent}
            </div>
          </div>
        )}

        {}
        {selectedNote ? (

          <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col bg-surface">
               <div className="max-w-5xl mx-auto w-full px-6 sm:px-10 lg:px-12 pt-6 pb-2 space-y-4 shrink-0 bg-surface">
                {}
                <input
                  type="text"
                  placeholder="Untitled note"
                  value={selectedNote.title || ''}
                  onChange={(e) => {
                    useStore.getState().updateFocusNoteSilent(selectedNote.id, {
                      title: e.target.value,
                    })
                  }}
                   className="w-full text-left text-2xl sm:text-3xl font-bold tracking-tight text-ink bg-transparent outline-none border-none placeholder:text-ink-3/40 leading-tight"
                />
              </div>

              {}
              <div className="flex-1 min-h-0 flex flex-col bg-surface">
                <Suspense
                  fallback={
                    <div className="flex-1 grid place-items-center text-sm text-ink-3">
                      Loading editor…
                    </div>
                  }
                >
                  <PlateEditor
                    key={selectedNote.id}
                    value={selectedNote.text}
                    onChange={handleEditorChange}
                    autoFocus={!selectedNote.text}
                    onStatsChange={setEditorStats}
                  />
                </Suspense>
              </div>

              {}
               <div className="px-6 py-2 border-t border-line/40 bg-surface shrink-0 flex items-center justify-between text-[11px] text-ink-3 tnum">
                <div className="flex items-center gap-1">
                  <Clock size={11} />
                  <span>Created {fmtTimeAgo(selectedNote.createdAt)}</span>
                </div>

                 <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleNoteType(selectedNote)}
                      className="text-[11px] font-semibold text-ink-2 hover:text-[var(--c-accent)] cursor-pointer"
                    >
                      {isStudyNote(selectedNote) ? 'Study note' : 'Lecture note'}
                    </button>
                   {selectedAssignment && (
                     <button
                       type="button"
                       onClick={() => onOpenTask?.(selectedAssignment.id)}
                       disabled={!onOpenTask}
                       className={cx(
                         'inline-flex items-center gap-1 max-w-[240px] truncate',
                         onOpenTask && 'text-ink-2 hover:text-ink cursor-pointer',
                         !onOpenTask && 'cursor-default',
                       )}
                       title={`Linked task: ${selectedAssignment.title}`}
                     >
                       <ListTodo size={11} className="shrink-0" />
                       <span className="truncate">{selectedAssignment.title}</span>
                     </button>
                   )}
                  <span>{editorStats.words} words</span>
                  <span>~{editorStats.readingMin}m read</span>
                </div>
              </div>
            </div>
          </div>
        ) : (

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 scroll-slim bg-bg">
            <div className="max-w-7xl mx-auto space-y-7">
              {}
              {(currentSubfolders.length > 0 || isCreatingGalleryFolder) && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[12px] font-bold text-ink-3 uppercase tracking-wider">
                      Folders ({currentSubfolders.length + (isCreatingGalleryFolder ? 1 : 0)})
                    </h2>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {}
                    {isCreatingGalleryFolder && (
                      <div
                        className="flex items-center gap-2.5 p-3 animate-in fade-in zoom-in-95 duration-150"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Folder size={16} className="text-[var(--c-accent)] shrink-0" />
                        <input
                          ref={galleryFolderInputRef}
                          type="text"
                          autoFocus
                          placeholder="Folder name…"
                          value={galleryNewFolderName}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) => setGalleryNewFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleCommitGalleryFolder()
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault()
                              setIsCreatingGalleryFolder(false)
                            }
                          }}
                          onBlur={handleCommitGalleryFolder}
                          className="w-full p-0 text-[13px] font-semibold text-ink bg-transparent outline-none focus-visible:outline-none rounded-none focus-visible:rounded-none border-b border-[var(--c-accent)] placeholder:text-ink-3"
                        />
                      </div>
                    )}

                    {currentSubfolders.map((folder) => {
                       const count = noteCounts.byFolder[folder.id] || 0
                      const isRenaming = renamingTarget?.id === folder.id && renamingTarget.source === 'gallery'
                      const isDropTarget = dragOverFolderId === folder.id

                      return (
                        <div
                          key={folder.id}
                          draggable={!isRenaming}
                          onDragStart={(e) => {
                            if (isRenaming) {
                              e.preventDefault()
                              return
                            }
                            draggedItemRef.current = { type: 'folder', id: folder.id }
                            e.dataTransfer.setData('application/nudge-folder-id', folder.id)
                            e.dataTransfer.setData('text/plain', folder.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => {
                            draggedItemRef.current = null
                            setDragOverFolderId(null)
                            setDragOverCourseId(null)
                            setDragOverGeneral(false)
                            setDragOverBreadcrumbId(null)
                          }}
                          onClick={() => {
                            if (isRenaming) return
                            navigateToFolder(folder.id)
                          }}
                          onDragOver={(e) => {
                            const isFolderDrag = e.dataTransfer.types.includes('application/nudge-folder-id')
                            const isNoteDrag = e.dataTransfer.types.includes('application/nudge-note-id')
                            if (!isNoteDrag && !isFolderDrag) return
                            if (
                              isFolderDrag &&
                              draggedItemRef.current?.type === 'folder' &&
                              (draggedItemRef.current.id === folder.id ||
                                isDescendant(folder.id, draggedItemRef.current.id))
                            ) {
                              return
                            }
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            setDragOverFolderId(folder.id)
                          }}
                          onDragLeave={(e) => {
                            if (!e.currentTarget.contains(e.relatedTarget as Node) && dragOverFolderId === folder.id) {
                              setDragOverFolderId(null)
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            setDragOverFolderId(null)
                            const noteId = e.dataTransfer.getData('application/nudge-note-id')
                            if (noteId) {
                              handleMoveNote(noteId, folder.courseId ?? null, folder.id)
                              return
                            }
                            const draggedFolderId = e.dataTransfer.getData('application/nudge-folder-id')
                            if (draggedFolderId && draggedFolderId !== folder.id) {
                              handleMoveFolder(draggedFolderId, folder.courseId ?? null, folder.id)
                            }
                          }}
                          className={cx(
                            'group flex items-center justify-between p-3 rounded-xl border bg-surface hover:border-line-2 hover:bg-surface-2 transition-all cursor-pointer select-none',
                            'border-line',
                            isDropTarget && 'border-[var(--c-accent)] bg-tint',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Folder size={16} className="text-[var(--c-accent)] shrink-0" />
                            <div className="min-w-0 flex-1">
                              {isRenaming ? (
                                <input
                                  ref={renameInputRef}
                                  type="text"
                                  value={renamingFolderName}
                                  draggable={false}
                                  onClick={(e) => e.stopPropagation()}
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onChange={(e) => setRenamingFolderName(e.target.value)}
                                  onKeyDown={(e) => {
                                     e.stopPropagation()
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      commitRenameFolder(false)
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault()
                                      commitRenameFolder(true)
                                    }
                                  }}
                                  onBlur={() => commitRenameFolder(false)}
                                  className="w-full p-0 text-[13px] font-semibold text-ink bg-transparent outline-none focus-visible:outline-none rounded-none focus-visible:rounded-none border-b border-[var(--c-accent)]"
                                  aria-label="Rename folder"
                                />
                              ) : (
                                <>
                                  <p
                                    className="text-[13px] font-semibold text-ink truncate leading-tight"
                                    onDoubleClick={(e) => {
                                      e.stopPropagation()
                                      beginRenameFolder(folder, 'gallery')
                                    }}
                                  >
                                    {folder.name}
                                  </p>
                                  <p className="text-[11px] text-ink-3">
                                    {count} {count === 1 ? 'note' : 'notes'}
                                  </p>
                                </>
                              )}
                            </div>
                          </div>

                          {!isRenaming && (
                            <div
                              className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  beginRenameFolder(folder, 'gallery')
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Rename"
                                className="h-6 w-6 rounded grid place-items-center text-ink-3 hover:text-ink hover:bg-tint cursor-pointer"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteFolderDirect(folder)
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Delete"
                                className="h-6 w-6 rounded grid place-items-center text-ink-3 hover:text-[var(--c-critical-ink)] hover:bg-tint cursor-pointer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[12px] font-bold text-ink-3 uppercase tracking-wider">
                    {noteTypeFilter === 'study' ? 'Study notes' : noteTypeFilter === 'lecture' ? 'Lecture notes' : 'Notes'} ({filteredNotes.length})
                  </h2>
                </div>

                {filteredNotes.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                    {filteredNotes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        course={note.courseId ? coursesMap.get(note.courseId) ?? null : null}
                        folder={note.folderId ? foldersMap.get(note.folderId) ?? null : null}
                        courses={courses}
                        folders={folders}
                        generalFolders={foldersByCourse.get(null) ?? []}
                        foldersByCourse={foldersByCourse}
                        onOpen={selectNote}
                        onQuickPeek={setPeekNoteId}
                        onMoveTo={handleMoveNote}
                        onTogglePin={handleTogglePin}
                        onToggleReviewed={handleToggleReviewed}
                        onDelete={handleDeleteNote}
                         onOpenTask={onOpenTask}
                        showCourseBadge={selectedCourseId === 'all'}
                        showFolderBadge={!selectedFolderId}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="py-16 text-center flex flex-col items-center justify-center">
                    <EmptyState
                      icon={<StickyNote size={26} />}
                      title="No notes found"
                      body={
                        search
                          ? 'No notes match your search.'
                          : 'This space is clean and ready. Create a note to start writing.'
                      }
                      action={
                        <Button variant="primary" onClick={() => handleCreateNewNote()}>
                          <Plus size={15} />
                          <span>Create note</span>
                        </Button>
                      }
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {}
      <NotePeekModal
        note={peekNote}
        course={peekNote?.courseId ? coursesMap.get(peekNote.courseId) ?? null : null}
        folder={peekNote?.folderId ? foldersMap.get(peekNote.folderId) ?? null : null}
        notesList={filteredNotes}
        onClose={() => setPeekNoteId(null)}
        onSelectNote={(n) => setPeekNoteId(n.id)}
        onOpenFullEditor={(n) => {
          setPeekNoteId(null)
          selectNote(n.id)
        }}
        onOpenTask={onOpenTask}
      />
    </div>
  )
}
