// A user counts as "new" to the platform for 2 weeks after joining.
export const NEW_USER_WINDOW_DAYS = 14

export function isNewUser(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  const joined = new Date(createdAt).getTime()
  if (Number.isNaN(joined)) return false
  return Date.now() - joined <= NEW_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000
}
