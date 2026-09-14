import type { Command } from './validate'
import { useStore } from '../store'

export interface CommandHost {
  go: (route: 'today' | 'plan' | 'courses' | 'progress') => void
  openTask: (taskId: string) => void
  openCourse: (courseId: string) => void
  openSettings: () => void
  openAddTask: () => void
  openShortcuts: () => void
  openExport: () => void
  openImport: () => void
  openEraseConfirm: () => void
  openSampleConfirm: () => void
  startFocus: (taskId: string | null, minutes?: number, blockId?: string | null, label?: string) => void
  setFocusExpanded: (v: boolean) => void
  showBlock: (blockId: string) => void
  shiftWeek: (delta: number | 'reset') => void
  toggleClassTimes: () => void
  fillGaps: () => void
  toast: (message: string) => void
}

export interface CommandResult {
  ran: Command[]
  skipped: { command: Command; why: string }[]
}

export function runCommands(commands: Command[], host: CommandHost): CommandResult {
  const ran: Command[] = []
  const skipped: { command: Command; why: string }[] = []

  for (const c of commands) {
    const store = useStore.getState()
    const skip = (why: string) => skipped.push({ command: c, why })

    switch (c.action) {
      case 'open_today':
        host.go('today')
        break
      case 'open_planner':
        host.go('plan')
        break
      case 'open_courses':
        host.go('courses')
        break
      case 'open_progress':
        host.go('progress')
        break

      case 'open_task':
        if (!c.taskId) {
          skip('no task named')
          continue
        }
        host.openTask(c.taskId)
        break
      case 'open_course':
        if (!c.courseId) {
          skip('no course named')
          continue
        }
        host.openCourse(c.courseId)
        break

      case 'open_settings':
        host.openSettings()
        break
      case 'open_add_task':
        host.openAddTask()
        break
      case 'open_shortcuts':
        host.openShortcuts()
        break
      case 'open_export':
        host.openExport()
        break
      case 'open_import':
        host.openImport()
        break
      case 'open_erase_confirm':
        host.openEraseConfirm()
        break

      case 'start_focus': {
        if (store.timer) {
          skip('the timer is already running')
          continue
        }
        host.startFocus(c.taskId ?? null, c.minutes, c.blockId ?? null)
        break
      }
      case 'pause_timer':
        if (!store.timer) {
          skip('nothing is running')
          continue
        }
        if (store.timer.runningSince == null) {
          skip('it is already paused')
          continue
        }
        store.pauseTimer()
        break
      case 'resume_timer':
        if (!store.timer) {
          skip('nothing is running')
          continue
        }
        if (store.timer.runningSince != null) {
          skip('it is already running')
          continue
        }
        store.resumeTimer()
        break
      case 'next_round':
        if (!store.timer) {
          skip('nothing is running')
          continue
        }
        store.startNextRound()
        break
      case 'stop_timer':
      case 'finish_and_stop': {
        if (!store.timer) {
          skip('nothing is running')
          continue
        }
        const banked = store.endSitting({ finish: c.action === 'finish_and_stop' })
        host.setFocusExpanded(false)
        if (banked?.minutes) host.toast(`Logged ${Math.round(banked.minutes)} min`)
        break
      }
      case 'show_focus':
        if (!store.timer) {
          skip('nothing is running')
          continue
        }
        host.setFocusExpanded(true)
        break
      case 'hide_focus':
        host.setFocusExpanded(false)
        break

      case 'next_week':
        host.go('plan')
        host.shiftWeek(1)
        break
      case 'previous_week':
        host.go('plan')
        host.shiftWeek(-1)
        break
      case 'this_week':
        host.go('plan')
        host.shiftWeek('reset')
        break
      case 'toggle_class_times':
        host.go('plan')
        host.toggleClassTimes()
        break
      case 'fill_gaps':
        host.go('plan')
        host.fillGaps()
        break

      case 'load_sample_data':
        host.openSampleConfirm()
        break
      case 'undo':
        if (!store.undo()) {
          skip('there is nothing to undo')
          continue
        }
        break

      default:
        skip('Nudge has no such action')
        continue
    }
    ran.push(c)
  }

  return { ran, skipped }
}
