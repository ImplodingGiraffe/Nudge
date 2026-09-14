import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarRange,
  GraduationCap,
  Home,
  Keyboard,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  StickyNote,
} from 'lucide-react'
import { useStore } from './lib/store'
import { useDerived } from './lib/derive'
import { hasActiveOverlays, useHashRoute, useIsMobile, useNow } from './lib/hooks'
import { fmtDay, fmtTime, startOfWeek } from './lib/date'
import { Onboarding } from './components/Onboarding'
import { FocusChip, FocusOverlay, useTimerEngine } from './components/focus/Focus'
import { useAiConfig } from './lib/ai/useAiConfig'
import type { Surface } from './lib/ai/prompt'
import { CommandHostContext, type CommandHost } from './lib/ai/commandHost'
import { encodeBackup } from './lib/backup'
import { Button, ConfirmDialog, IconButton, Kbd, Sheet, ToastHost } from './components/ui'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NUDGE_WELCOME_NOTE_JSON, isVeryFirstNote, markWelcomeNoteSeen } from './lib/notes'
import { useToast } from './lib/toast'
import { cx } from './lib/ui'
import { Today } from './components/today/Today'
import { Plan } from './components/plan/Plan'
import { Courses } from './components/courses/Courses'
import { Progress } from './components/progress/Progress'
import { BlockSheet } from './components/plan/BlockSheet'
import { AssignmentSheet } from './components/tasks/AssignmentSheet'
import { CourseSheet } from './components/courses/CourseSheet'
import { NewTaskSheet } from './components/tasks/NewTaskSheet'
import { Settings } from './components/Settings'
import { AiPanel } from './components/ai/AiPanel'
import { ExportSheet, ImportSheet } from './components/BackupSheets'
import { Notes } from './components/notes/Notes'

type Route = 'today' | 'plan' | 'courses' | 'notes' | 'progress'

const NAV: { id: Route; label: string; icon: typeof Home; key: string }[] = [
  { id: 'today', label: 'Today', icon: Home, key: 'T' },
  { id: 'plan', label: 'Plan', icon: CalendarRange, key: 'P' },
  { id: 'courses', label: 'Courses', icon: GraduationCap, key: 'C' },
  { id: 'notes', label: 'Notes', icon: StickyNote, key: 'O' },
  { id: 'progress', label: 'Progress', icon: BarChart3, key: 'G' },
]

function LoadingScreen() {
  return <div className="min-h-[180px] flex-1 grid place-items-center text-sm text-ink-3">Loading…</div>
}

export default function App() {
  return (
    <TooltipProvider>
      <ToastHost>
        <Shell />
      </ToastHost>
    </TooltipProvider>
  )
}

function Shell() {
  const now = useNow(30_000)
  const derived = useDerived(now)
  const settings = useStore((s) => s.settings)
  const timer = useStore((s) => s.timer)
  const assignments = useStore((s) => s.assignments)
  const courses = useStore((s) => s.courses)
  const blocks = useStore((s) => s.blocks)
  const clearDoneFromToday = useStore((s) => s.clearDoneFromToday)
  const { toast } = useToast()
  const isMobile = useIsMobile()

  const [routeRaw, go] = useHashRoute('today')
  const route = (NAV.some((n) => n.id === routeRaw) ? routeRaw : 'today') as Route

  const [quickAdd, setQuickAdd] = useState(false)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)

  const openNewNote = useCallback(
    (initialCourseId?: string | null, initialAssignmentId?: string | null) => {
      const state = useStore.getState()
      const isFirst = isVeryFirstNote(state.focusNotes.length)
      if (isFirst) {
        markWelcomeNoteSeen()
      }
      const note = state.addFocusNote({
        text: isFirst ? NUDGE_WELCOME_NOTE_JSON : '',
        courseId: initialCourseId ?? null,
        assignmentId: initialAssignmentId ?? null,
      })
      setSelectedNoteId(note.id)
      go('notes')
    },
    [go],
  )

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [openBlockId, setOpenBlockId] = useState<string | null>(null)
  const [courseSheet, setCourseSheet] = useState<{ id: string | null } | null>(null)
  const [focusExpanded, setFocusExpanded] = useState(false)
  const [focusCourseId, setFocusCourseId] = useState<string | null>(null)

  const [aiIntent, setAiIntent] = useState<{ surface: Surface; request?: string; horizonDays?: number } | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const ai = useAiConfig()

  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true)
    window.addEventListener('nudge:open-settings', handleOpenSettings)
    return () => window.removeEventListener('nudge:open-settings', handleOpenSettings)
  }, [])

  const [weekOffset, setWeekOffset] = useState(0)
  const [showClasses, setShowClasses] = useState(true)
  const [fillSignal, setFillSignal] = useState(0)

  const [planFocus, setPlanFocus] = useState<{ id: string; nonce: number } | null>(null)
  const [backupText, setBackupText] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [confirmErase, setConfirmErase] = useState(false)
  const [confirmSample, setConfirmSample] = useState(false)

  const openAi = useCallback((intent?: { surface: Surface; request?: string; horizonDays?: number }) => {
    setAiIntent(intent ?? null)
    setAiOpen(true)
  }, [])

  const clearPlanFocus = useCallback(() => setPlanFocus(null), [])

  const openBlockEditor = useCallback((blockId: string) => setOpenBlockId(blockId), [])

  const openPlanBlock = useCallback(
    (blockId: string) => {
      const b = useStore.getState().blocks.find((x) => x.id === blockId)
      if (!b) return
      const weeks = Math.round(
        (+startOfWeek(new Date(b.start)) - +startOfWeek(Date.now())) / (7 * 86_400_000),
      )
      setWeekOffset(() => weeks)
      setPlanFocus({ id: blockId, nonce: Date.now() })
      go('plan')
    },
    [go],
  )

  useEffect(() => {
    const run = () => clearDoneFromToday()
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    if (idleWindow.requestIdleCallback) {
      const id = idleWindow.requestIdleCallback(run, { timeout: 1000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(run, 0)
    return () => window.clearTimeout(id)
  }, [clearDoneFromToday])

  useEffect(() => {
    const el = document.documentElement
    el.classList.remove('theme-light', 'theme-dark')
    if (settings.theme !== 'system') el.classList.add(`theme-${settings.theme}`)
    el.dataset.palette = settings.palette
    try {
      localStorage.setItem('nudge.theme', settings.theme)
      localStorage.setItem('nudge.palette', settings.palette)
    } catch {}

    const sync = () => {
      const bg = getComputedStyle(el).getPropertyValue('--c-bg').trim()
      if (!bg) return
      el.style.background = bg
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    }
    sync()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [settings.theme, settings.palette])

  useTimerEngine()

  const startFocus = useCallback(
    (
      assignmentId: string | null,
      courseId: string | null,
      blockId: string | null,
      opts?: { minutes?: number; justStart?: boolean },
    ) => {
      const st = useStore.getState()
      const plan = blockId ? st.blocks.find((b) => b.id === blockId)?.plan : undefined
      st.startSitting({
        assignmentId,
        courseId,
        blockId,
        minutes: opts?.minutes ?? st.settings.focusMin,
        justStart: opts?.justStart,
        plan,
      })
      setFocusExpanded(true)
    },
    [],
  )

  const justStart = useCallback(() => {
    const top = derived.ranked[0]
    if (!top) {
      setQuickAdd(true)
      return
    }
    startFocus(top.assignment.id, top.assignment.courseId, null, { minutes: 10, justStart: true })
  }, [derived.ranked, startFocus])

  const commandHost = useMemo<CommandHost>(
    () => ({
      go: (r) => go(r),
      openTask: (id) => setOpenTaskId(id),
      openCourse: (id) => {
        setFocusCourseId(id)
        go('courses')
      },
      openSettings: () => setSettingsOpen(true),
      openAddTask: () => setQuickAdd(true),
      openShortcuts: () => setShortcutsOpen(true),
      openExport: () => {
        const st = useStore.getState()
        void encodeBackup({
          version: st.version,
          courses: st.courses,
          assignments: st.assignments,
          blocks: st.blocks,
          plannerEvents: st.plannerEvents,
          scheduleOverrides: st.scheduleOverrides,
          sessions: st.sessions,
          focusNotes: st.focusNotes,
          todayList: st.todayList,
          settings: st.settings,
        }).then(setBackupText)
      },
      openImport: () => setImporting(true),
      openEraseConfirm: () => setConfirmErase(true),
      openSampleConfirm: () => setConfirmSample(true),
      startFocus: (taskId, minutes, blockId, label) => {
        const st = useStore.getState()
        const task = taskId ? st.assignments.find((a) => a.id === taskId) : null
        const target = task ?? derived.ranked[0]?.assignment ?? null
        const planned = blockId ? st.blocks.find((b) => b.id === blockId)?.plan : undefined

        st.startSitting({
          assignmentId: target?.id ?? null,
          courseId: target?.courseId ?? null,
          blockId: blockId ?? null,
          minutes: minutes ?? st.settings.focusMin,
          justStart: minutes != null && minutes <= 10,
          plan: planned,
          label,
        })
      },
      setFocusExpanded,
      showBlock: (blockId) => {
        openPlanBlock(blockId)
      },
      shiftWeek: (delta) => setWeekOffset((n) => (delta === 'reset' ? 0 : n + delta)),
      toggleClassTimes: () => setShowClasses((v) => !v),
      fillGaps: () => setFillSignal((n) => n + 1),
      toast: (m) => toast(m),
    }),
    [derived.ranked, go, openPlanBlock, toast],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (focusExpanded || hasActiveOverlays()) return
        e.preventDefault()
        setQuickAdd(true)
        return
      }
      const command = e.metaKey || e.ctrlKey
      const undo = command && e.key.toLowerCase() === 'z' && !e.shiftKey
      const redo = (command && e.key.toLowerCase() === 'z' && e.shiftKey) || (command && e.key.toLowerCase() === 'y')
      if ((undo || redo) && !typing) {
        e.preventDefault()
        const changed = redo ? useStore.getState().redo() : useStore.getState().undo()
        if (changed) toast(redo ? 'Redone' : 'Undone')
        return
      }
      if (focusExpanded || hasActiveOverlays()) return
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      const k = e.key.toLowerCase()
      if (k === 'n') {
        e.preventDefault()
        setQuickAdd(true)
      } else if (k === 'd') {
        e.preventDefault()
        openNewNote()
      } else if (k === 't') go('today')
      else if (k === 'p') go('plan')
      else if (k === 'c') go('courses')
      else if (k === 'o') go('notes')
      else if (k === 'g') go('progress')
      else if (k === 'f') {
        e.preventDefault()
        justStart()
      } else if (k === 'a' && ai.available) {
        e.preventDefault()
        openAi()
      } else if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ai.available, focusExpanded, go, justStart, openAi, openNewNote, toast])

  const openTask = useMemo(() => assignments.find((a) => a.id === openTaskId) ?? null, [assignments, openTaskId])
  const openBlock = useMemo(() => blocks.find((b) => b.id === openBlockId) ?? null, [blocks, openBlockId])
  const editingCourse = courseSheet?.id ? (courses.find((c) => c.id === courseSheet.id) ?? null) : null

  if (!settings.onboarded) {
    return (
      <>
        <Onboarding onAddCourse={() => setCourseSheet({ id: null })} />
        {courseSheet && (
          <Suspense fallback={null}>
            <CourseSheet course={editingCourse} onClose={() => setCourseSheet(null)} />
          </Suspense>
        )}
      </>
    )
  }

  const content = (
    <>
      {route === 'today' && (
        <Today
          derived={derived}
          now={now}
          onOpenTask={setOpenTaskId}
          onStartFocus={startFocus}
          onGoPlan={() => go('plan')}
          onGoProgress={() => go('progress')}
          onOpenCourse={(id) => setCourseSheet({ id })}
          onOpenBlock={openBlockEditor}
          onQuickAdd={() => setQuickAdd(true)}
          onAddCourse={() => setCourseSheet({ id: null })}
          onAskAi={openAi}
        />
      )}
      {route === 'plan' && (
        <Plan
          derived={derived}
          now={now}
          onStartFocus={startFocus}
          onAddCourse={() => setCourseSheet({ id: null })}
          onEditCourse={(id) => setCourseSheet({ id })}
          onAskAi={openAi}
          weekOffset={weekOffset}
          setWeekOffset={setWeekOffset}
          showClasses={showClasses}
          setShowClasses={setShowClasses}
          fillSignal={fillSignal}
          focusBlock={planFocus}
          onFocusHandled={clearPlanFocus}
        />
      )}
      {route === 'courses' && (
        <Courses
          derived={derived}
          now={now}
          onOpenTask={setOpenTaskId}
          onEditCourse={(id) => setCourseSheet({ id })}
          onAddCourse={() => setCourseSheet({ id: null })}
          focusCourseId={focusCourseId}
        />
      )}
      {route === 'notes' && (
        <Notes
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          onOpenTask={setOpenTaskId}
        />
      )}
      {route === 'progress' && <Progress derived={derived} now={now} />}
    </>
  )

  return (
    <CommandHostContext.Provider value={commandHost}>
      <div className="h-full min-h-0 flex-1 flex overflow-hidden bg-bg text-ink">
        {!isMobile && (
          <nav className="w-[212px] shrink-0 h-full border-r border-line bg-surface flex flex-col" aria-label="Main">
            <div className="px-4 pt-4 pb-3 flex items-center gap-2.5">
              <span className="h-8 w-8 rounded-[9px] bg-invert-bg text-invert-ink grid place-items-center font-bold text-[15px]">
                N
              </span>
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Nudge</span>
            </div>

            <div className="px-3 pb-3 flex flex-col gap-1.5">
              <p className="px-1 pb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Create</p>
              <Button variant="primary" full onClick={() => setQuickAdd(true)} className="justify-between">
                <span className="flex items-center gap-2">
                  <Plus size={16} />
                  Add task
                </span>
                <span className="text-[11px] opacity-55 font-normal">⌘K</span>
              </Button>

              {ai.available && (
                <Button full onClick={() => openAi()} className="justify-between">
                  <span className="flex items-center gap-2">
                    <Sparkles size={15} />
                    Plan with Nudge
                  </span>
                  <span className="text-[11px] text-ink-3 font-normal">A</span>
                </Button>
              )}
              <Button full onClick={() => openNewNote()} className="justify-between">
                <span className="flex items-center gap-2">
                  <StickyNote size={15} />
                   New Note
                </span>
                <span className="text-[11px] text-ink-3 font-normal">D</span>
              </Button>
            </div>

            <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">Workspace</p>
            <ul className="px-2 flex flex-col gap-0.5 min-h-0 overflow-y-auto scroll-slim">
              {NAV.map((n) => {
                const active = route === n.id
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => go(n.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'w-full h-9 px-2.5 rounded-[9px] flex items-center gap-2.5 text-[13.5px] font-medium transition-colors',
                        active ? 'bg-tint text-ink' : 'text-ink-2 hover:bg-tint hover:text-ink',
                      )}
                    >
                      <n.icon size={16} className="shrink-0" />
                      {n.label}
                      <span className="ml-auto text-[10.5px] text-ink-3 opacity-0 group-hover:opacity-100">{n.key}</span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="mt-auto shrink-0">
              {timer && <FocusChip variant="rail" onExpand={() => setFocusExpanded(true)} />}
              <div className="p-2 flex items-center gap-1">
                <IconButton label="Settings" size="sm" onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon size={16} />
                </IconButton>
                <IconButton label="Keyboard shortcuts" size="sm" onClick={() => setShortcutsOpen(true)}>
                  <Keyboard size={16} />
                </IconButton>
                {useStore.getState().isSample && (
                  <span className="ml-auto mr-1 text-[10.5px] text-ink-3 px-1.5 py-0.5 rounded-md bg-tint">sample</span>
                )}
              </div>
            </div>
          </nav>
        )}

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {isMobile && (
            <header className="shrink-0 z-30 flex items-center gap-2 px-3 h-[52px] bg-bg/90 backdrop-blur-md border-b border-line">
              <span className="h-7 w-7 rounded-lg bg-invert-bg text-invert-ink grid place-items-center font-bold text-[13px] shrink-0">
                N
              </span>

              {timer ? (
                <FocusChip variant="header" onExpand={() => setFocusExpanded(true)} />
              ) : (
                <span className="text-[14.5px] font-semibold text-ink">Nudge</span>
              )}
              <div className="ml-auto flex items-center gap-0.5 shrink-0">
                 <IconButton label="New Note" size="sm" onClick={() => openNewNote()}>
                  <StickyNote size={17} />
                </IconButton>
                {ai.available && (
                  <IconButton label="Plan with Nudge" size="sm" onClick={() => openAi()}>
                    <Sparkles size={17} />
                  </IconButton>
                )}
                <IconButton label="Settings" size="sm" onClick={() => setSettingsOpen(true)}>
                  <SettingsIcon size={17} />
                </IconButton>
              </div>
            </header>
          )}

          {timer && focusExpanded && <FocusOverlay onMinimise={() => setFocusExpanded(false)} />}

          <main className="flex-1 min-h-0 flex flex-col overflow-y-auto scroll-slim">
            <Suspense fallback={<LoadingScreen />}>{content}</Suspense>
          </main>

          {isMobile && (
            <nav
              className="shrink-0 z-40 bg-surface/95 backdrop-blur-md border-t border-line pb-[env(safe-area-inset-bottom,0px)]"
              aria-label="Main"
            >
              <ul className="flex items-stretch h-[58px]">
                {NAV.slice(0, 2).map((n) => (
                  <TabButton key={n.id} nav={n} active={route === n.id} onClick={() => go(n.id)} />
                ))}
                <li className="w-[68px] shrink-0 grid place-items-center">
                  <button
                    onClick={() => setQuickAdd(true)}
                    aria-label="Add task"
                    className="h-11 w-11 rounded-full bg-invert-bg text-invert-ink grid place-items-center shadow-card active:scale-95 transition-transform"
                  >
                    <Plus size={21} />
                  </button>
                </li>
                {NAV.slice(2).map((n) => (
                  <TabButton key={n.id} nav={n} active={route === n.id} onClick={() => go(n.id)} />
                ))}
              </ul>
            </nav>
          )}
        </div>

        {quickAdd && (
          <Suspense fallback={null}>
            <NewTaskSheet onClose={() => setQuickAdd(false)} onCreated={setOpenTaskId} />
          </Suspense>
        )}
        {settingsOpen && (
          <Suspense fallback={null}>
            <Settings open onClose={() => setSettingsOpen(false)} />
          </Suspense>
        )}
        {openTask && (
          <Suspense fallback={null}>
            <AssignmentSheet
              assignment={openTask}
              onClose={() => setOpenTaskId(null)}
              onStartFocus={(aid, cid) => startFocus(aid, cid, null)}
              loggedMin={derived.byAssignment.get(openTask.id) ?? 0}
              calibrationFactor={derived.calibration.factor}
              derived={derived}
              now={now}
            />
          </Suspense>
        )}
        {openBlock && (
          <Suspense fallback={null}>
            <BlockSheet
              block={openBlock}
              courses={courses}
              assignments={assignments}
              onClose={() => setOpenBlockId(null)}
               onPatch={(patch) => useStore.getState().updateBlock(openBlock.id, patch)}
               onReschedule={(startMs, endMs) => useStore.getState().moveBlock(openBlock.id, startMs, endMs)}
              onDuplicate={() => {
                const copy = useStore.getState().duplicateBlock(openBlock.id)
                if (!copy) return
                setOpenBlockId(copy.id)
                toast(`Copied to ${fmtDay(copy.start)}, ${fmtTime(copy.start)}`, {
                  action: { label: 'Undo', run: () => useStore.getState().undo() },
                })
              }}
              onDelete={() => {
                useStore.getState().removeBlock(openBlock.id)
                setOpenBlockId(null)
                toast('Block deleted', { action: { label: 'Undo', run: () => useStore.getState().undo() } })
              }}
              onToggleDone={() => {
                useStore.getState().toggleBlockDone(openBlock.id)
                setOpenBlockId(null)
              }}
              onFocus={() => {
                startFocus(openBlock.assignmentId, openBlock.courseId, openBlock.id)
                setOpenBlockId(null)
              }}
            />
          </Suspense>
        )}
        {courseSheet && (
          <Suspense fallback={null}>
            <CourseSheet course={editingCourse} onClose={() => setCourseSheet(null)} />
          </Suspense>
        )}
        {aiOpen && (
          <Suspense fallback={null}>
            <AiPanel open onClose={() => setAiOpen(false)} derived={derived} now={now} initial={aiIntent} />
          </Suspense>
        )}
        {backupText !== null && (
          <Suspense fallback={null}>
            <ExportSheet open onClose={() => setBackupText(null)} text={backupText} />
          </Suspense>
        )}
        {importing && (
          <Suspense fallback={null}>
            <ImportSheet
              open
              onClose={() => setImporting(false)}
              onRestore={(data) => {
                useStore.getState().importState(data)
                toast('Data restored', { action: { label: 'Undo', run: () => useStore.getState().undo() } })
              }}
            />
          </Suspense>
        )}
        <ConfirmDialog
          open={confirmErase}
          onClose={() => setConfirmErase(false)}
          onConfirm={() => {
            useStore.getState().resetAll()
            toast('Everything erased. Fresh start.')
          }}
          title="Erase all your data?"
          body="This removes your courses, tasks, study blocks, and logged sessions. It cannot be undone. Export a backup first if you may need it."
          confirmLabel="Erase everything"
        />
        <ConfirmDialog
          open={confirmSample}
          onClose={() => setConfirmSample(false)}
          onConfirm={() => {
            useStore.getState().loadSample()
            toast('Sample semester loaded', { action: { label: 'Undo', run: () => useStore.getState().undo() } })
          }}
          title="Replace everything with the sample semester?"
          body="This replaces your courses, tasks, and study blocks with demo data. You can undo while this tab stays open. After a reload, restore a backup to recover your data."
          confirmLabel="Load the sample"
        />
        <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </div>
    </CommandHostContext.Provider>
  )
}

function TabButton({
  nav,
  active,
  onClick,
}: {
  nav: (typeof NAV)[number]
  active: boolean
  onClick: () => void
}) {
  return (
    <li className="flex-1">
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'w-full h-full flex flex-col items-center justify-center gap-[3px] transition-colors',
          active ? 'text-ink' : 'text-ink-3',
        )}
      >
        <nav.icon size={19} strokeWidth={active ? 2.3 : 1.9} />
        <span className="text-[10.5px] font-medium">{nav.label}</span>
      </button>
    </li>
  )
}

const SHORTCUTS: [string, string][] = [
  ['⌘K / N', 'New task'],
  ['D', 'New note (opens Plate editor)'],
  ['F', 'Start a 10-minute session on your top task'],
  ['A', 'Plan with Nudge'],
  ['T / P / C / O / G', 'Today · Plan · Courses · Notes · Progress'],
  ['⌘Z', 'Undo the last change'],
  ['⌘⇧Z / Ctrl+Y', 'Redo the last undone change'],
  ['?', 'This list'],
]

const PLANNER_MOVES: [string, string][] = [
  ['Click a study block', 'Open it to edit, duplicate or delete'],
  ['Drag a study block', 'Move it to any day or time'],
  ['Drag its top or bottom edge', 'Make it longer or shorter'],
  ['Click or drag empty space', 'Create a study block there'],
  ['Click a striped class', 'Edit that course’s class times'],
  ['⌥ + drag', 'Duplicate instead of move'],
  ['↑ ↓ on a selected block', 'Nudge by 15 minutes'],
  ['Shift + ↑ ↓', 'Resize by 15 minutes'],
  ['Space / Delete', 'Mark done · remove'],
]

function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Shortcuts" size="sm">
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map(([k, label]) => (
            <li key={k} className="flex items-center justify-between gap-4 text-[13px]">
              <span className="text-ink-2">{label}</span>
              <Kbd>{k}</Kbd>
            </li>
          ))}
        </ul>
        <div className="border-t border-line pt-3.5">
          <h3 className="text-[12.5px] font-semibold text-ink mb-2">In the planner</h3>
          <ul className="flex flex-col gap-2">
            {PLANNER_MOVES.map(([k, label]) => (
              <li key={k} className="flex items-center justify-between gap-4 text-[13px]">
                <span className="text-ink-2">{label}</span>
                <span className="text-[11.5px] text-ink-3 text-right shrink-0">{k}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Sheet>
  )
}
