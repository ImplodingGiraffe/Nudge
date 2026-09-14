import type {
  ID,
  Iso,
  WorkUnit,
  WorkStatus,
  AppState,
  Assignment,
  StudyBlock,
  Session,
  Subtask,
  TaskKind,
  ScheduleSlot,
  TimeLog,
} from './types'
import { uid } from './id'
import { MIN_LOGGABLE_MIN } from './timer'

export { MIN_LOGGABLE_MIN }

const TASK_KINDS: ReadonlySet<string> = new Set([
  'assignment',
  'essay',
  'problemset',
  'project',
  'reading',
  'quiz',
  'midterm',
  'final',
  'takehome',
  'lab',
  'presentation',
  'personal',
])

function isTaskKind(kind: string): kind is TaskKind {
  return TASK_KINDS.has(kind)
}

function isWorkStatus(status: unknown): status is WorkStatus {
  return status === 'todo' || status === 'doing' || status === 'done'
}

function normalizedStatus(status: unknown, fallback: unknown = 'todo'): WorkStatus {
  if (isWorkStatus(status)) return status
  return isWorkStatus(fallback) ? fallback : 'todo'
}

export function durationMinutes(start: string, end: string): number {
  const n = Math.round((+new Date(end) - +new Date(start)) / 60000)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

export function isAutoLog(log: Pick<TimeLog, 'source' | 'auto'>): boolean {
  if (log.auto === false) return false
  if (log.auto === true) return true
  return log.source === 'block'
}

function slotFrom(block: StudyBlock): ScheduleSlot {
  return {
    start: block.start,
    end: block.end,
    ...(block.locked ? { locked: true } : {}),
  }
}

function cloneUnit(u: WorkUnit): WorkUnit {
  return {
    ...u,
    logs: Array.isArray(u.logs) ? u.logs.filter((l) => !!l && typeof l === 'object').map((l) => ({ ...l })) : [],
    schedule: u.schedule && typeof u.schedule === 'object' ? { ...u.schedule } : null,
    plan: Array.isArray(u.plan) ? u.plan.map((p) => ({ ...p })) : undefined,
  }
}

function cloneUnits(src: Record<ID, WorkUnit> | undefined): Record<ID, WorkUnit> {
  const out: Record<ID, WorkUnit> = Object.create(null) as Record<ID, WorkUnit>
  if (!src || typeof src !== 'object') return out
  for (const [id, u] of Object.entries(src)) {
    if (!u || typeof u !== 'object' || Array.isArray(u)) continue
    out[id] = cloneUnit(u)
  }
  return out
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value.filter((x) => !!x && typeof x === 'object') : []
}

const SLOT_KEYS = ['start', 'end', 'locked'] as const

function sameSlot(a: ScheduleSlot | null | undefined, b: ScheduleSlot | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return SLOT_KEYS.every((k) => a[k] === b[k])
}

function unchangedUnit(next: WorkUnit, prev: WorkUnit | undefined): boolean {
  if (!prev) return false
  for (const key of Object.keys(next) as (keyof WorkUnit)[]) {
    if (key === 'updatedAt' || key === 'schedule' || key === 'logs' || key === 'plan') continue
    if (next[key] !== prev[key]) return false
  }
  for (const key of Object.keys(prev) as (keyof WorkUnit)[]) {
    if (!(key in next)) return false
  }
  return next.logs === prev.logs && next.plan === prev.plan && sameSlot(next.schedule, prev.schedule)
}

function put(units: Record<ID, WorkUnit>, prev: WorkUnit | undefined, built: WorkUnit): void {
  units[built.id] = unchangedUnit(built, prev) ? (prev as WorkUnit) : built
}

function breakParentCycles(units: Record<ID, WorkUnit>, ownerOf: Map<ID, ID>): void {
  for (const start of Object.keys(units)) {
    const seen = new Map<ID, number>()
    const path: ID[] = []
    let current: ID | null = start
    while (current && units[current]) {
      const previous = seen.get(current)
      if (previous !== undefined) {
        const cycleNode = path[previous]
        const owner = ownerOf.get(cycleNode)
        units[cycleNode] = {
          ...units[cycleNode],
          parentId: owner && owner !== cycleNode && units[owner] ? owner : null,
        }
        break
      }
      seen.set(current, path.length)
      path.push(current)
      current = units[current].parentId
    }
  }
}

function sittingParentId(block: StudyBlock, units: Record<ID, WorkUnit>): ID | null {
  const subtask = block.subtaskId ? units[block.subtaskId] : undefined
  if (subtask && block.subtaskId !== block.id && subtask.kind === 'step') {
    const root = getRoot(units, subtask)
    if (!block.assignmentId || root.id === block.assignmentId) return subtask.id
  }
  return block.assignmentId && units[block.assignmentId] && units[block.assignmentId].kind !== 'sitting'
    ? block.assignmentId
    : null
}

function logFromSession(s: Session): TimeLog {
  return {
    id: s.id,
    start: s.start,
    end: s.end,
    minutes: s.minutes,
    source: s.source,
    sittingId: s.sittingId,
    auto: s.auto,
    createdAt: s.createdAt,
    courseId: s.courseId,
    assignmentId: s.assignmentId,
  }
}

function childIndex(units: Record<ID, WorkUnit>): Map<ID, WorkUnit[]> {
  const index = new Map<ID, WorkUnit[]>()
  for (const u of Object.values(units)) {
    if (!u.parentId) continue
    const list = index.get(u.parentId)
    if (list) list.push(u)
    else index.set(u.parentId, [u])
  }
  return index
}

function descendantsOf(id: ID, children: Map<ID, WorkUnit[]>): WorkUnit[] {
  const out: WorkUnit[] = []
  const seen = new Set<ID>([id])
  const queue: ID[] = [id]
  while (queue.length) {
    const current = queue.shift()!
    for (const child of children.get(current) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      queue.push(child.id)
    }
  }
  return out
}

function minutesOf(logs: TimeLog[], pred: (l: TimeLog) => boolean = () => true): number {
  return logs.reduce(
    (sum, l) => (pred(l) && Number.isFinite(l.minutes) && l.minutes >= 0 ? sum + l.minutes : sum),
    0,
  )
}

function hasScheduledDescendant(units: Record<ID, WorkUnit>, id: ID, children = childIndex(units)): boolean {
  return descendantsOf(id, children).some((c) => !!c.schedule)
}

function shouldTopUp(unit: WorkUnit, snapshot: Record<ID, WorkUnit>, children?: Map<ID, WorkUnit[]>): boolean {
  return !!unit.schedule && !hasScheduledDescendant(snapshot, unit.id, children ?? childIndex(snapshot))
}

function creditedForTopUp(unit: WorkUnit, units: Record<ID, WorkUnit>, children?: Map<ID, WorkUnit[]>): number {
  let n = minutesOf(unit.logs)
  for (const child of descendantsOf(unit.id, children ?? childIndex(units))) n += minutesOf(child.logs)

  if (unit.kind !== 'sitting') return n

  let pid = unit.parentId
  const seen = new Set<ID>([unit.id])
  while (pid && units[pid] && !seen.has(pid)) {
    seen.add(pid)
    n += minutesOf(units[pid].logs, (l) => !isAutoLog(l))
    pid = units[pid].parentId
  }
  return n
}

function attachSessions(units: Record<ID, WorkUnit>, sessions: Session[]): void {
  const validSessionIds = new Set(sessions.map((s) => s.id))
  const holders = new Map<ID, ID[]>()
  for (const u of Object.values(units)) {
    const nextLogs: TimeLog[] = []
    for (const l of u.logs) {
      if (!validSessionIds.has(l.id)) continue
      const list = holders.get(l.id)
      if (list) list.push(u.id)
      else holders.set(l.id, [u.id])
      nextLogs.push(l)
    }
    if (nextLogs.length !== u.logs.length) units[u.id] = { ...u, logs: nextLogs }
  }

  const targetOf = (s: Session): ID | null => {
    if (s.blockId && units[s.blockId]) return s.blockId
    if (isAutoLog(s)) return null
    const owned = holders.get(s.id)
    if (owned) {
      const live = owned.filter((id) => units[id])
      if (live.length === 1) return live[0]
    }
    if (s.assignmentId && units[s.assignmentId]) return s.assignmentId
    return liveOwner(owned)
  }

  function liveOwner(owned: ID[] | undefined): ID | null {
    if (!owned) return null
    const live = owned.filter((id) => units[id])
    return live[0] ?? null
  }

  const byUnit = new Map<ID, TimeLog[]>()
  const placed = new Set<ID>()

  for (const s of sessions) {
    const target = targetOf(s)
    if (!target || !units[target] || placed.has(s.id)) continue
    placed.add(s.id)
    const list = byUnit.get(target) ?? []
    list.push(logFromSession(s))
    byUnit.set(target, list)
  }

  for (const u of Object.values(units)) {
    const next = byUnit.get(u.id) ?? []
    units[u.id] = { ...u, logs: next }
  }
}

export function mergeProjectedSessions(
  projected: Session[],
  priorSessions: Session[],
  priorUnits: Record<ID, WorkUnit>,
  liveUnits?: Record<ID, WorkUnit>,
): Session[] {
  const emitted = new Set(projected.map((s) => s.id))
  const priorLogIds = new Set(Object.values(priorUnits).flatMap((u) => u.logs.map((l) => l.id)))
  const extra = priorSessions.filter(
    (s) => !emitted.has(s.id) && (!priorLogIds.has(s.id) || !isAutoLog(s)),
  )
  if (!extra.length) return projected
  const seen = new Set(emitted)
  const out = [...projected]
  for (const s of extra) {
    if (seen.has(s.id)) continue
    seen.add(s.id)
    if (liveUnits && s.blockId && !liveUnits[s.blockId]) {
      if (isAutoLog(s)) continue
      out.push({ ...s, blockId: null })
      continue
    }
    out.push(s)
  }
  return out
}

export function realDue(due: string | undefined, createdAt: string): string | undefined {
  return due && due !== createdAt ? due : undefined
}

export function rootDeliverableId(units: Record<ID, WorkUnit>, id: ID): ID | null {
  const start = units[id]
  if (!start) return null
  const root = getRoot(units, start)
  return root.kind === 'sitting' ? null : root.id
}

export function stampCompletions(units: Record<ID, WorkUnit>, nowIso: string): Record<ID, WorkUnit> {
  const children = childIndex(units)
  for (const u of Object.values(units)) {
    if (u.status !== 'done' || u.completedAt) continue
    let latest: Iso | undefined
    for (const child of descendantsOf(u.id, children)) {
      const at = (units[child.id] ?? child).completedAt
      if (at && (!latest || at > latest)) latest = at
    }
    units[u.id] = { ...u, completedAt: latest ?? u.schedule?.end ?? nowIso }
  }
  return units
}

export function reconcileUnitClosures(
  units: Record<ID, WorkUnit>,
  prior: Record<ID, WorkUnit>,
  nowIso: string,
): Record<ID, WorkUnit> {
  const next: Record<ID, WorkUnit> = { ...units }
  const children = childIndex(units)
  for (const u of Object.values(units)) {
    const wasDone = prior[u.id]?.status === 'done'
    const isDone = u.status === 'done'
    const hasAuto = u.logs.some((l) => isAutoLog(l))

    if (isDone) {
      const owedATopUp = !wasDone || hasAuto
      if (!owedATopUp || !shouldTopUp(u, next, children)) continue
      const logs = reconcileAutoTopUp(u, nowIso, next, children)
      if (logs === u.logs) continue
      next[u.id] = { ...u, logs, completedAt: u.completedAt ?? nowIso, updatedAt: nowIso }
    } else if (hasAuto || u.completedAt) {
      next[u.id] = {
        ...u,
        logs: hasAuto ? u.logs.filter((l) => !isAutoLog(l)) : u.logs,
        completedAt: undefined,
        updatedAt: nowIso,
      }
    }
  }
  return stampCompletions(next, nowIso)
}

export function syncBlocksFromUnits(blocks: StudyBlock[], units: Record<ID, WorkUnit>): StudyBlock[] {
  if (!Array.isArray(blocks)) return []
  let changed = false
  const next = blocks.map((b) => {
    const u = units[b.id]
    if (!u) return b
    const done = u.status === 'done'
    if (!!b.done === done) return b
    changed = true
    return { ...b, done }
  })
  return changed ? next : blocks
}

export function syncAssignmentsFromUnits(
  assignments: Assignment[],
  units: Record<ID, WorkUnit>,
  nowIso = new Date().toISOString(),
): Assignment[] {
  if (!Array.isArray(assignments)) return []
  let changed = false
  const next = assignments.map((a) => {
    const u = units[a.id]
    if (!u) return a
    const status = normalizedStatus(u.status)

    let subtasksChanged = false
    const subtasks = asArray(a.subtasks).map((st) => {
      const su = units[st.id]
      if (!su) return st
      const done = normalizedStatus(su.status) === 'done'
      const completedAt = done ? st.completedAt ?? su.completedAt ?? nowIso : undefined
      const parentId = su.parentId && su.parentId !== a.id ? su.parentId : undefined
      if (st.done === done && st.completedAt === completedAt && st.parentId === parentId) return st
      subtasksChanged = true
      return { ...st, done, completedAt, parentId }
    })

    const completedAt = status === 'done' ? a.completedAt ?? u.completedAt ?? nowIso : undefined
    if (!subtasksChanged && a.status === status && a.completedAt === completedAt) return a
    changed = true
    return { ...a, status, completedAt, subtasks }
  })
  return changed ? next : assignments
}

export function sessionCreditsBlock(session: Session, block: StudyBlock): boolean {
  if (isAutoLog(session)) return false
  if (session.blockId === block.id) return true
  if (session.blockId) return false
  if (session.assignmentId === block.id) return true
  if (block.subtaskId && session.assignmentId === block.subtaskId) return true
  if (!session.assignmentId || session.assignmentId !== block.assignmentId) return false
  return block.subtaskId !== block.id
}

export function deriveCompositeStatus(childStatuses: WorkStatus[], ownStatus: WorkStatus = 'todo'): WorkStatus {
  const children = childStatuses.map((status) => normalizedStatus(status))
  const own = normalizedStatus(ownStatus)
  if (children.length === 0) return own
  if (children.every((s) => s === 'done')) return 'done'
  if (children.some((s) => s === 'doing' || s === 'done')) return 'doing'
  if (own === 'doing') return 'doing'
  return 'todo'
}

export function applyCompositeStatus(units: Record<ID, WorkUnit>): Record<ID, WorkUnit> {
  const children = childIndex(units)

  const visited = new Set<ID>()
  for (const root of Object.keys(units)) {
    if (visited.has(root)) continue
    const stack: { id: ID; expanded: boolean }[] = [{ id: root, expanded: false }]
    const onPath = new Set<ID>()
    while (stack.length) {
      const frame = stack[stack.length - 1]
      if (!units[frame.id] || visited.has(frame.id)) {
        stack.pop()
        onPath.delete(frame.id)
        continue
      }
      if (!frame.expanded) {
        frame.expanded = true
        onPath.add(frame.id)
        for (const child of children.get(frame.id) ?? []) {
          if (!visited.has(child.id) && !onPath.has(child.id)) stack.push({ id: child.id, expanded: false })
        }
        continue
      }
      stack.pop()
      onPath.delete(frame.id)
      visited.add(frame.id)

      const kids = (children.get(frame.id) ?? []).filter((c) => (units[c.id] ?? c).kind !== 'sitting')
      if (!kids?.length) continue
      const unit = units[frame.id]
      const nextStatus = deriveCompositeStatus(
        kids.map((c) => (units[c.id] ?? c).status),
        unit.status,
      )
      if (unit.status !== nextStatus) units[frame.id] = { ...unit, status: nextStatus }
    }
  }
  return units
}

export function stateToUnits(state: AppState): Record<ID, WorkUnit> {
  const units: Record<ID, WorkUnit> = cloneUnits(state.units)
  const now = new Date().toISOString()

  const assignments = asArray(state.assignments)
  const blocks = asArray(state.blocks)
  const sessions = asArray(state.sessions)

  const validAssignmentIds = new Set(assignments.map((a) => a.id))
  const validSubtaskIds = new Set(assignments.flatMap((a) => asArray(a.subtasks).map((st) => st.id)))
  const validBlockIds = new Set(blocks.map((b) => b.id))
  const blocksById = new Map<ID, StudyBlock>()
  for (const b of blocks) if (!blocksById.has(b.id)) blocksById.set(b.id, b)
  const subtaskOwner = new Map<ID, ID>()
  for (const a of assignments) {
    for (const st of asArray(a.subtasks)) subtaskOwner.set(st.id, a.id)
  }

  for (const a of assignments) {
    const existing = units[a.id]
    const rootBlock = blocksById.get(a.id)
    if (existing) {
      put(units, existing, {
        ...existing,
        parentId: null,
        courseId: a.courseId,
        title: a.title,
        kind: isTaskKind(a.kind) ? a.kind : existing.kind,
        due: existing.due === undefined && a.due === existing.createdAt ? undefined : a.due,
        weight: a.weight,
        grade: a.grade,
        status: normalizedStatus(a.status, existing?.status),
        estimateMin: a.estimateMin ?? existing.estimateMin,
        notes: a.notes,
        completedAt: a.completedAt,
        breakdownDismissed: a.breakdownDismissed,
        archived: a.archived,
        private: a.private,
        schedule: rootBlock ? slotFrom(rootBlock) : null,
        blockKind: rootBlock?.kind,
        location: rootBlock?.location,
        plan: rootBlock?.plan,
        updatedAt: now,
      })
    } else {
      units[a.id] = {
        id: a.id,
        parentId: null,
        courseId: a.courseId,
        title: a.title,
        kind: isTaskKind(a.kind) ? a.kind : 'assignment',
        due: a.due,
        weight: a.weight,
        grade: a.grade,
        status: normalizedStatus(a.status),
        estimateMin: a.estimateMin ?? 60,
        schedule: null,
        logs: [],
        notes: a.notes,
        completedAt: a.completedAt,
        blockKind: rootBlock?.kind,
        location: rootBlock?.location,
        createdAt: a.createdAt || now,
        updatedAt: now,
        private: a.private,
        breakdownDismissed: a.breakdownDismissed,
        archived: a.archived,
      }
    }

    for (const st of asArray(a.subtasks)) {
      const existingStep = units[st.id]
      const selfBlock = blocksById.get(st.id)
      const selfSlot = selfBlock ? slotFrom(selfBlock) : null
      const validParent = (parentId: ID | undefined | null): parentId is ID =>
        !!parentId &&
        parentId !== st.id &&
        (parentId === a.id || subtaskOwner.get(parentId) === a.id)
      const parentId = validParent(st.parentId)
        ? st.parentId
        : validParent(existingStep?.parentId)
          ? existingStep.parentId
          : a.id

      if (existingStep) {
        const keepSitting = existingStep.kind === 'sitting'
        const kind = keepSitting || existingStep.kind === 'step' ? existingStep.kind : 'step'
        put(units, existingStep, {
          ...existingStep,
          parentId,
          courseId: a.courseId,
          title: st.title,
          kind,
          status: st.done ? 'done' : existingStep.status === 'done' ? 'todo' : normalizedStatus(existingStep.status),
          due: st.due,
          estimateMin: st.estimateMin ?? existingStep.estimateMin,
          schedule: keepSitting
            ? existingStep.schedule
            : selfSlot ?? (validBlockIds.has(st.id) ? existingStep.schedule : null),
          completedAt: st.completedAt,
          archived: a.archived,
          blockKind: selfBlock?.kind,
          location: selfBlock?.location,
          updatedAt: now,
        })
      } else {
        units[st.id] = {
          id: st.id,
          parentId,
          courseId: a.courseId,
          title: st.title,
          kind: 'step',
          due: st.due,
          status: st.done ? 'done' : 'todo',
          estimateMin: st.estimateMin ?? (selfBlock ? durationMinutes(selfBlock.start, selfBlock.end) || 45 : 45),
          schedule: selfSlot,
          logs: [],
          completedAt: st.completedAt,
          archived: a.archived,
          blockKind: selfBlock?.kind,
          location: selfBlock?.location,
          createdAt: a.createdAt || now,
          updatedAt: now,
        }
      }
    }
  }

  for (const b of blocks) {
    const slot = slotFrom(b)
    const dur = durationMinutes(b.start, b.end)
    const existing = units[b.id]
    if (existing) {
      const isSitting = existing.kind === 'sitting'
      let status = normalizedStatus(existing.status)
      if (b.done) status = 'done'
      else if (existing.status === 'done') status = 'todo'
      put(units, existing, {
        ...existing,
        schedule: slot,
        plan: isSitting ? b.plan : existing.plan,
        title: isSitting ? b.title ?? '' : existing.title,
        courseId: b.courseId !== undefined ? b.courseId : existing.courseId,
        parentId: isSitting ? sittingParentId(b, units) : existing.parentId,
        status,
        estimateMin: isSitting ? dur || existing.estimateMin : existing.estimateMin,
        due: isSitting ? b.end : existing.due,
        blockKind: b.kind,
        location: b.location,
        updatedAt: now,
      })
    } else {
      const parentId = sittingParentId(b, units)
      units[b.id] = {
        id: b.id,
        parentId,
        courseId: b.courseId,
        title: b.title ?? '',
        kind: 'sitting',
        due: b.end,
        status: b.done ? 'done' : 'todo',
        estimateMin: dur,
        schedule: slot,
        plan: b.plan,
        logs: [],
        blockKind: b.kind,
        location: b.location,
        createdAt: b.createdAt || now,
        updatedAt: now,
      }
    }
  }

  breakParentCycles(units, subtaskOwner)

  let cleaned = true
  while (cleaned) {
    cleaned = false
    for (const u of Object.values(units)) {
      const invalid =
        (u.kind === 'sitting' && !validBlockIds.has(u.id)) ||
        (u.kind === 'step' && !validSubtaskIds.has(u.id)) ||
        (u.parentId === null && u.kind !== 'sitting' && !validAssignmentIds.has(u.id))
      if (invalid) {
        delete units[u.id]
        cleaned = true
      }
    }
    for (const u of Object.values(units)) {
      if (u.parentId && !units[u.parentId]) {
        units[u.id] = { ...u, parentId: null }
        cleaned = true
      }
    }
  }

  attachSessions(units, sessions)
  return applyCompositeStatus(units)
}

function getRoot(units: Record<ID, WorkUnit>, unit: WorkUnit): WorkUnit {
  const visited = new Set<ID>([unit.id])
  let current = unit
  while (current.parentId && units[current.parentId] && !visited.has(current.parentId)) {
    visited.add(current.parentId)
    current = units[current.parentId]
  }
  return current
}

export function unitsToRelational(units: Record<ID, WorkUnit>): {
  assignments: Assignment[]
  blocks: StudyBlock[]
  sessions: Session[]
} {
  const allUnits = Object.values(units)
  const rootUnits = allUnits.filter((u) => u.parentId === null && u.kind !== 'sitting')
  const assignments: Assignment[] = []
  const blocks: StudyBlock[] = []
  const sessions: Session[] = []

  const seenLogIds = new Set<ID>()
  for (const u of allUnits) {
    const rootParent = u.parentId ? getRoot(units, u) : u
    const assignmentId = rootParent && rootParent.kind !== 'sitting' ? rootParent.id : null
    const blockId = u.schedule ? u.id : null

    for (const log of u.logs) {
      if (seenLogIds.has(log.id)) continue
      seenLogIds.add(log.id)
      sessions.push({
        id: log.id,
        courseId: log.courseId !== undefined ? log.courseId : u.courseId,
        assignmentId: log.assignmentId !== undefined ? log.assignmentId : assignmentId,
        blockId,
        start: log.start,
        end: log.end,
        minutes: log.minutes,
        source: log.source,
        sittingId: log.sittingId,
        auto: log.auto,
        createdAt: log.createdAt,
      })
    }
  }

  const children = childIndex(units)
  const stepsUnder = (rootId: ID): WorkUnit[] => {
    const out: WorkUnit[] = []
    const seen = new Set<ID>([rootId])
    const stack = [...(children.get(rootId) ?? [])].reverse()
    while (stack.length) {
      const node = stack.pop()!
      if (seen.has(node.id)) continue
      seen.add(node.id)
      if (node.kind !== 'sitting') out.push(node)
      const kids = children.get(node.id)
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i])
    }
    return out
  }
  for (const root of rootUnits) {
    const childSteps = stepsUnder(root.id)
    const subtasks: Subtask[] = childSteps.map((st) => ({
      id: st.id,
      title: st.title,
      done: st.status === 'done',
      due: st.due,
      estimateMin: st.estimateMin,
      completedAt: st.completedAt,
      ...(st.parentId && st.parentId !== root.id ? { parentId: st.parentId } : {}),
    }))

    assignments.push({
      id: root.id,
      courseId: root.courseId,
      title: root.title,
      kind: isTaskKind(root.kind) ? root.kind : 'assignment',
      ...(root.due ? { due: root.due } : {}),
      weight: root.weight,
      status: root.status,
      estimateMin: root.estimateMin,
      subtasks,
      notes: root.notes,
      grade: root.grade,
      completedAt: root.completedAt,
      createdAt: root.createdAt,
      private: root.private,
      breakdownDismissed: root.breakdownDismissed,
      archived: root.archived,
    })
  }

  for (const u of allUnits) {
    if (!u.schedule) continue
    const rootParent = u.parentId ? getRoot(units, u) : u
    const isStep = u.kind === 'step'
    const assignmentId = rootParent && rootParent.kind !== 'sitting' ? rootParent.id : null
    const subtaskId = isStep
      ? u.id
      : u.kind === 'sitting' && u.parentId && units[u.parentId]?.kind === 'step'
        ? u.parentId
        : null

    blocks.push({
      id: u.id,
      courseId: u.courseId,
      assignmentId,
      subtaskId,
      title: u.title || undefined,
      start: u.schedule.start,
      end: u.schedule.end,
      done: u.status === 'done',
      plan: u.plan,
      locked: u.schedule.locked,
      kind: u.blockKind,
      location: u.location,
      createdAt: u.createdAt,
    })
  }

  return { assignments, blocks, sessions }
}

function reconcileAutoTopUp(
  unit: WorkUnit,
  nowIso: string,
  units: Record<ID, WorkUnit>,
  children?: Map<ID, WorkUnit[]>,
): TimeLog[] {
  const reported = unit.logs.filter((l) => !isAutoLog(l))
  const dropAuto = () => (reported.length === unit.logs.length ? unit.logs : reported)

  const slot = unit.schedule
  if (!slot) return dropAuto()

  const credited = creditedForTopUp({ ...unit, logs: reported }, units, children)
  const planned = durationMinutes(slot.start, slot.end)
  const want = Math.round((planned - credited) * 10) / 10
  if (want < MIN_LOGGABLE_MIN) return dropAuto()

  const existing = unit.logs.find((l) => isAutoLog(l))
  if (
    existing &&
    existing.minutes === want &&
    existing.start === slot.start &&
    existing.end === slot.end &&
    unit.logs.length === reported.length + 1
  ) {
    return unit.logs
  }

  const root = getRoot(units, unit)
  const next: TimeLog = {
    id: existing?.id ?? uid(),
    start: slot.start,
    end: slot.end,
    minutes: want,
    source: 'block',
    auto: true,
    createdAt: existing?.createdAt ?? nowIso,
    courseId: unit.courseId,
    assignmentId: root.kind !== 'sitting' ? root.id : null,
  }
  return [...reported, next]
}

export function transitionUnitStatus(
  currentUnits: Record<ID, WorkUnit>,
  id: ID,
  status: WorkStatus,
  nowIso = new Date().toISOString(),
): Record<ID, WorkUnit> {
  const target = currentUnits[id]
  if (!target || !isWorkStatus(status)) return currentUnits

  const next: Record<ID, WorkUnit> = { ...currentUnits }
  const isBecomingDone = status === 'done' && target.status !== 'done'
  const isReopening = status !== 'done' && target.status === 'done'

  let updatedLogs = [...target.logs]
  if (isBecomingDone && shouldTopUp(target, currentUnits)) {
    updatedLogs = reconcileAutoTopUp(target, nowIso, currentUnits)
  } else if (isReopening) {
    updatedLogs = updatedLogs.filter((l) => !isAutoLog(l))
  }

  next[id] = {
    ...target,
    status,
    completedAt: status === 'done' ? target.completedAt ?? nowIso : undefined,
    logs: updatedLogs,
    updatedAt: nowIso,
  }

  const childrenOf = childIndex(next)

  if (isBecomingDone || isReopening) {
    for (const child of descendantsOf(id, childrenOf)) {
      const current = next[child.id] ?? child
      let childLogs = [...current.logs]
      if (isBecomingDone && shouldTopUp(current, next, childrenOf)) {
        childLogs = reconcileAutoTopUp({ ...current, logs: childLogs }, nowIso, next, childrenOf)
      } else if (isReopening) {
        childLogs = childLogs.filter((l) => !isAutoLog(l))
      }

      next[child.id] = {
        ...current,
        status,
        completedAt: status === 'done' ? current.completedAt ?? nowIso : undefined,
        logs: childLogs,
        updatedAt: nowIso,
      }
    }
  }

  let currParentId = target.parentId
  const visitedParents = new Set<ID>()
  while (currParentId && next[currParentId] && !visitedParents.has(currParentId)) {
    visitedParents.add(currParentId)
    const parent = next[currParentId]
    const kids = (childrenOf.get(currParentId) ?? [])
      .filter((c) => (next[c.id] ?? c).kind !== 'sitting')
      .map((c) => next[c.id] ?? c)
    const compositeStatus = deriveCompositeStatus(
      kids.map((c) => c.status),
      parent.status,
    )

    let parentLogs = [...parent.logs]
    if (compositeStatus === 'done' && parent.status !== 'done' && shouldTopUp(parent, next, childrenOf)) {
      parentLogs = reconcileAutoTopUp({ ...parent, logs: parentLogs }, nowIso, next, childrenOf)
    } else if (compositeStatus !== 'done' && parent.status === 'done') {
      parentLogs = parentLogs.filter((l) => !isAutoLog(l))
    }

    next[currParentId] = {
      ...parent,
      status: compositeStatus,
      completedAt: compositeStatus === 'done' ? parent.completedAt ?? nowIso : undefined,
      logs: parentLogs,
      updatedAt: nowIso,
    }
    currParentId = parent.parentId
  }

  return stampCompletions(next, nowIso)
}
