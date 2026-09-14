import { useMemo } from 'react'
import { useStore } from './store'
import { MIN_LOGGABLE_MIN, liveMinutes } from './timer'
import { computeCalibration, dayLoads, rankAssignments, type Ranked } from './priority'
import { computeStreak, minutesByAssignment, minutesByCourse, staleDaysByCourse } from './stats'
import { buildNudges } from './nudges'
import { dayKey, startOfDay } from './date'
import type { Assignment, Course, Session, Subtask } from './types'

export interface TodayEntry {
  assignment: Assignment
  course?: Course

  steps: Subtask[]
  nextStep?: Subtask
  done: boolean
  loggedMin: number

  carriedFrom?: string
}

export function useDerived(now: number) {
  const courses = useStore((s) => s.courses)
  const todayList = useStore((s) => s.todayList)
  const assignments = useStore((s) => s.assignments)
  const blocks = useStore((s) => s.blocks)
  const plannerEvents = useStore((s) => s.plannerEvents)
  const banked = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)
  const timer = useStore((s) => s.timer)

  const sessions = useMemo(() => {
    if (!timer) return banked
    const minutes = liveMinutes(timer, now)
    if (minutes < MIN_LOGGABLE_MIN) return banked
    const inProgress: Session = {
      id: `live:${timer.id}`,
      courseId: timer.courseId,
      assignmentId: timer.assignmentId,
      blockId: timer.blockId,
      start: timer.startedAt,
      minutes,
      source: timer.source,
      sittingId: timer.id,
      createdAt: timer.startedAt,
    }
    return [...banked, inProgress]
  }, [banked, timer, now])

  return useMemo(() => {
    const byAssignment = minutesByAssignment(sessions)
    const byCourse = minutesByCourse(sessions)
    const staleByCourse = staleDaysByCourse(courses, sessions, now)
    const calibration = computeCalibration(assignments, byAssignment)
    const streak = computeStreak(sessions, now)

    const todayKey = dayKey(now)
    const studiedTodayMin = sessions
      .filter((s) => dayKey(s.start) === todayKey)
      .reduce((s, x) => s + x.minutes, 0)

    const ranked: Ranked[] = rankAssignments(assignments, {
      now,
      dailyCapacityMin: settings.dailyCapacityMin,
      studiedTodayMin,
      courses,
      calibration,
      minutesByAssignment: byAssignment,
      staleByCourse,
    })

    const loads = dayLoads(blocks, sessions, startOfDay(now), 7, settings.dailyCapacityMin)
    const todayLoad = loads[0]

    const nudges = buildNudges({
      now,
      tone: settings.tone,
      ranked,
      courses,
      assignments,
      blocks,
      plannerEvents,
      sessions,
      streak,
      calibration,
      minutesByAssignment: byAssignment,
      staleByCourse,
      todayLoad,
      muted: settings.mutedNudges,
    })

    const byId = new Map(assignments.map((a) => [a.id, a]))
    const courseById = new Map(courses.map((c) => [c.id, c]))
    const plan: TodayEntry[] = []
    for (const ref of todayList) {
      const assignment = byId.get(ref.assignmentId)
      if (!assignment || assignment.archived) continue
      plan.push({
        assignment,
        course: assignment.courseId ? courseById.get(assignment.courseId) : undefined,
        steps: assignment.subtasks,
        nextStep: assignment.subtasks.find((t) => !t.done),
        done: assignment.status === 'done',
        loggedMin: Math.round(byAssignment.get(assignment.id) ?? 0),
        carriedFrom: ref.day < todayKey ? ref.day : undefined,
      })
    }
    const planOpen = plan.filter((e) => !e.done)
    const planDone = plan.length - planOpen.length

    const committed = new Set(todayList.map((t) => t.assignmentId))
    const suggestions = ranked.filter((r) => !committed.has(r.assignment.id))

    const activeCourses = courses.filter((c) => !c.archived)
    const openCount = assignments.filter((a) => a.status !== 'done' && !a.archived).length
    const doneCount = assignments.filter((a) => a.status === 'done' && !a.archived).length

    return {

      sessions,
      ranked,
      plan,
      planOpen,
      planDone,
      suggestions,
      nudges,
      streak,
      calibration,
      byAssignment,
      byCourse,
      staleByCourse,
      loads,
      todayLoad,
      studiedTodayMin,
      activeCourses,
      openCount,
      doneCount,
      todayKey,
    }
  }, [courses, assignments, blocks, plannerEvents, sessions, settings, todayList, now])
}

export type Derived = ReturnType<typeof useDerived>
