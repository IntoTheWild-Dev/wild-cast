// New designs use the requested AffiliPrint conversion; historical records
// without a profile keep their previous FOGRA51 fallback.
export const DEFAULT_PRINT_PROFILE = 'fogra39-300'
export const LEGACY_PRINT_PROFILE = 'fogra51'
const PROFILES = new Set(['fogra39-300', 'fogra39', 'fogra51'])

export function printProfileFor(project) {
  return PROFILES.has(project?.iccProfile) ? project.iccProfile : LEGACY_PRINT_PROFILE
}
