// One page width for the whole app (Anang's ask, 2026-09-25: every page's
// content should line up with the header). Header.jsx, every centred page
// container and the full-width pages' bands all read from here, so the left
// and right edges match everywhere. Changing the width is one edit here.
export const PAGE_MAX_WIDTH = 1320
export const PAGE_GUTTER = 32

// Horizontal padding for a full-width band (e.g. the white title strip on
// Design library / Assets / My Tasks) whose content should still line up
// with PAGE_MAX_WIDTH: at least the gutter, and on a wide window exactly
// the space that centres a PAGE_MAX_WIDTH column.
export const PAGE_PADDING_X = `max(${PAGE_GUTTER}px, calc((100% - ${PAGE_MAX_WIDTH}px) / 2 + ${PAGE_GUTTER}px))`

// Height of Header.jsx's sticky bar (same on desktop and mobile) - anything
// else that sticks while the page scrolls sits just below it.
export const APP_HEADER_HEIGHT = 59

// The white title/filter band on Design library / Assets / My Tasks stays
// put under the app header while the list scrolls (Anang's ask, 2026-10-01).
// Desktop only: on a phone those bands wrap to half the screen or more, and
// pinning them would leave almost no room for the list itself. zIndex sits
// under the app header (100) but above the cards, whose hover transforms
// would otherwise paint over it.
export function stickyPageBar(isMobile) {
  return isMobile ? {} : { position: 'sticky', top: APP_HEADER_HEIGHT, zIndex: 50 }
}
