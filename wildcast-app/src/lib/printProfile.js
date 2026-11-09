export const DEFAULT_PRINT_PROFILE = 'fogra51'

// Historical designs have no reliable profile metadata; keep today's default.
export function printProfileFor(project) {
  return project?.iccProfile === 'fogra39' ? 'fogra39' : DEFAULT_PRINT_PROFILE
}
