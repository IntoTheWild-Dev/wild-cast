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
