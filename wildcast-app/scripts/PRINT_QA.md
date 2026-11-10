# Composed-page print QA

The app's JavaScript preflight checks structure, colour spaces and component ink. It cannot establish the final overprint/transparency result. `composed-ink-report.py` is a separate local/CI check that renders the final PDF using Ghostscript's **tiffsep** device with overprint enabled and scans all rendered CMYK pixels.

This adds no Ghostscript dependency to the Vercel runtime. Normal downloads explicitly say composed QA is still required; no app header or successful object check means this report ran. Hosting a renderer for automatic production validation would be a separate infrastructure change.

## Run

Install Ghostscript for the operating system and the isolated Python QA dependencies:

```sh
python3 -m pip install -r scripts/requirements-print-qa.txt
python3 scripts/composed-ink-report.py exported.pdf \
  --icc api/icc/ISOcoated_v2_300_eci.icc --dpi 150 > composed-report.json
```

The chosen ICC must match the PDF's embedded output ICC byte-for-byte. The renderer uses that profile for default CMYK and output; it does not silently select another destination. The report records the ICC hash, Ghostscript version, device, overprint mode, DPI, maximum summed process ink, maximum position and the bounds/count of pixels over the limit. Coordinates are millimetres from the rendered media page's top-left, not the trim origin.

Exit status: **0** passed at the stated resolution; **1** ink exceeds the limit; **2** check not performed/failed (missing renderer, wrong ICC, render failure, incomplete pages). An unavailable checker is never a pass. Raw maxima are always reported; tolerance defaults to zero. An explicit `--tolerance` up to one percentage point is available for reviewing quantization, but is uniform rather than edge-aware and must be agreed/documented for a print job.

Use a higher DPI (up to 600) if small details matter. A 150 dpi proof may miss subpixel features; the report is not press certification, a physical colour measurement, a complete PDF/X validator, or approval for spot-colour jobs.

## Renderer regression

```sh
python3 -m unittest discover -s tests -p 'test_composed_ink.py' -v
```

The real renderer must distinguish three controlled pages: 280% background plus K100 overprint (~320%), the same K100 knocked out (~280%), and a 75%-opacity overprint (~310%). This proves that enabling colour management did not hide the overprint problem by reconverting/clipping it to the ink cap. The tests also reject a missing renderer and a mismatched ICC.

Fix reported overlaps by adjusting the affected artwork/overprint or making an appropriate profile conversion, then run the report again. Never scale all four ink channels to force a pass. CI runs this regression independently of the JavaScript tests; it does not automatically check every subsequently downloaded customer PDF.
