export const uid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {

  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
