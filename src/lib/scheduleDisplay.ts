import type { Assignment, BlockKind, Course, StudyBlock } from './types'

type DisplayInput = {
  block: StudyBlock
  course?: Course
  assignment?: Assignment
  stepTitle?: string
}

const normalize = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function isDefaultBlockTitle(kind: BlockKind | undefined, value: string | undefined) {
  const resolvedKind = kind ?? 'study'
  const title = normalize(value)
  if (!title) return true
  if (resolvedKind === 'free') return title === 'free time' || title === 'appointment'
  if (resolvedKind === 'appointment') return title === 'appointment' || title === 'free time'
  if (resolvedKind === 'one_off_class') return title === 'one-off' || title === 'one-off class'
  return title === 'study' || title === 'study block'
}

export function blockDisplay({ block, course, assignment, stepTitle }: DisplayInput) {
  const kind = block.kind ?? 'study'
  const isStudy = kind === 'study'
  const isFree = kind === 'free'
  const isAppointment = kind === 'appointment'
  const isOneOffClass = kind === 'one_off_class'

  const rawTitle = block.title?.trim()

  let title: string
  if (isDefaultBlockTitle(kind, rawTitle)) {
    if (isStudy) {
      title = stepTitle || assignment?.title || course?.code || 'Study'
    } else if (isFree) {
      title = 'Free time'
    } else if (isAppointment) {
      title = 'Appointment'
    } else {
      title = 'One-off class'
    }
  } else {
    title = rawTitle as string
  }

  return {
    title,
    typeLabel: isDefaultBlockTitle(kind, title)
      ? undefined
      : isOneOffClass
        ? 'ONE-OFF'
        : isFree
          ? 'FREE TIME'
          : isAppointment
            ? 'APPOINTMENT'
            : 'STUDY',
  }
}
