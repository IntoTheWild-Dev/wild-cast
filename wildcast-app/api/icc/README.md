# Print profile provenance

`ISOcoated_v2_300_eci.icc` is the unmodified **ISO Coated v2 300% (ECI)** profile from the official ECI Offset 2009 archive:

- Download catalogue: https://eci.org/doku.php_id=en_downloads.html
- Archive: https://eci.org/lib/exe/eci_offset_2009.zip
- Archive member: `ECI_Offset_2009/ISOcoated_v2_300_eci.icc`
- Size: 1,829,093 bytes
- SHA-256: `c6b4b62f0726243742eced8b9669476a6be89e581f50a7600ed8b6fcbb9cdab8`
- Embedded copyright: PrintOpen 5.2.0 - (c) Copyright 2000-2006 Heidelberger Druckmaschinen AG. All Rights Reserved.
- ECI description: https://eci.org/lib/exe/eci_offset_2009.zip (contains `ISOcoated_v2_300_info.pdf` and `ECI_Offset_2009_EN.pdf`).

Profile bytes and copyright metadata are preserved. The profile targets FOGRA39L, coated stock and a 300% total area coverage; this does not by itself establish a physical colour match to a specific press/paper/reference.

Rebuild the conversion LUT from `wildcast-app/`:

```sh
python3 scripts/build-cmyk-lut.py ISOcoated_v2_300_eci.icc
python3 scripts/build-cmyk-to-rgb-lut.py ISOcoated_v2_300_eci.icc
```

The generator uses LittleCMS through Pillow, Relative Colorimetric intent and Black Point Compensation. The LUT is a derived 33-cube lookup table, not an edited ICC profile. `tests/fixtures/iso300-lcms.json` records independent direct-LittleCMS sample values used to check interpolation. No proportional post-conversion ink reduction is used.

The app identifier is `fogra39-300`; its PDF OutputConditionIdentifier remains `FOGRA39`, with the same exact 300% profile as DestOutputProfile. Standard `fogra39` and `fogra51` are retained for existing designs. New designs use `fogra39-300`; historical records without profile metadata keep their previous FOGRA51 fallback.

The print-colours admin API uses the same 300% forward/reverse conversion and calibration-sheet output intent. Existing saved brand CMYK recipes are not bulk-rewritten.
