# Print colours module

Lets the Wild Stack team (agency accounts only) get a brand's print colours right once and reuse them for every template of that brand, without a code change.

## The flow

1. **Brand colours**: one row per brand colour, with the screen colour (HEX/RGB) and the exact CMYK the print PDF uses, like an InDesign swatch. The fields are linked through PSO Coated v3 (Relative Colorimetric + BPC, the export's press profile). A **lock** stops a conversion from overwriting official values.
2. **Calibration sheet**: an A4 page of patches around the current value. Rows A to F go from lighter to darker; columns 1 to 5 shift the hue. The designer prints it, compares it with the reference and types the matching patch code (for example C4). The current value is always D3.
3. **Draft, then Approved**: a saved colour applies to the next export straight away as a *draft*. Once a real print confirms it, the designer approves it. Changing an approved CMYK makes it a draft again.
4. **Approved → code**: the screen shows a snippet for `api/_lib/brandColors.js`. Pasting it in makes the value the permanent built-in default (reviewed in a PR, and kept even if this module is removed).
5. **Printers**: *Standard* means the brand colours plus PDF/X-4. An optional named printer can carry its own colour adjustments and a file labelling of *Standard PDF/X-4* or *Like InDesign* (not marked PDF/X, with the output intent named "PSO Coated v3", exactly like the InDesign reference export). The brand's **default printer** is what every export uses.
6. **History**: who changed what, and when (the last 50 changes).

## Where things live

| Part | File |
|---|---|
| Storage, validation, history, code snippet | `api/_lib/printColors/store.js` (Blob: `settings/print-colors/<brand>.json`) |
| HEX ↔ RGB ↔ CMYK | `api/_lib/printColors/convert.js` + `api/icc/PSOcoated_v3.cmyk-to-srgb.lut` (built by `scripts/build-cmyk-to-rgb-lut.py`) |
| Calibration sheet | `api/_lib/printColors/calibration.js` |
| "Like InDesign" labelling | `api/_lib/printColors/relabel.js` |
| What the rest of the app imports | `api/_lib/printColors/index.js` |
| API | `api/print-colors.js` |
| Screen | `src/features/printColors/` |
| Tests | `tests/print-colors*.test.mjs` |

## Switching it off

Set `PRINT_COLORS=off` in Vercel. Exports then use the code table in `api/_lib/brandColors.js` with standard PDF/X-4 labelling, and the API answers 404. Saved settings stay in Blob, ready for when it's switched back on.

## Removing it completely

Every hook outside this folder is marked `[print-colors]`:

1. Delete `api/_lib/printColors/`, `api/print-colors.js`, `src/features/printColors/`, `tests/print-colors*.test.mjs`, `api/icc/PSOcoated_v3.cmyk-to-srgb.lut` and `scripts/build-cmyk-to-rgb-lut.py`.
2. `api/export-cmyk.js`: remove the import and the `printSettings` line, remove the `finishPdf` line in `send`, and change the two `library: printSettings.library` lines back to `library: getBrandLibrary(brand)` (the flat one can simply be deleted).
3. `src/App.jsx`: remove the import, the `print-colors` line in `handleNavigate`, and the `screen === 'print-colors'` block.
4. `src/components/Header.jsx`: remove the `Print colours` nav line.
5. `vercel.json`: remove the `api/print-colors.js` entry.
6. `api/_lib/auth.js`: `resolveKeyRole` can go back to not being exported.

Before removing it, copy any approved colours into `brandColors.js` using the snippet, so nothing is lost.
