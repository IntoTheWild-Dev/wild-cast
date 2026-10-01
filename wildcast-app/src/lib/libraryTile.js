// "Choose from library" tiles (Julia's ask, 2026-10-01: logos were cut off
// and came out different sizes). Every tile is the same square, and the
// whole image fits inside it with its own proportions (contain, not cover).
// `minmax(0, 1fr)` on the grid matters too: a plain 1fr column can't shrink
// below its image's natural width, so big files pushed their column wider
// than the rest and ran off the edge of the modal. Checkerboard so white
// or transparent logos stay visible. Used by FieldEditor's
// picker and LibraryAssetPickerField's.
export const LIBRARY_TILE_STYLE = {
  width: '100%', aspectRatio: '1', padding: 8, boxSizing: 'border-box',
  display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  background: 'repeating-conic-gradient(#f3f4f6 0% 25%, #fff 0% 50%) 50% / 12px 12px',
  border: '1.5px solid var(--border)', borderRadius: 6, cursor: 'pointer', transition: 'border-color 0.15s',
}
export const LIBRARY_TILE_IMG_STYLE = { display: 'block', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
