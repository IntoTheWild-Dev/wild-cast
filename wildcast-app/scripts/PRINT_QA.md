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

## Automatic local export gate

An optional sidecar now connects final CMYK export validation to the renderer.
Set a private `PRINT_QA_TOKEN` of at least 32 characters in the local environment,
then run `python3 scripts/serve-print-qa.py`. It binds only to `127.0.0.1:8767`.
Wait for `GET /health` to return 204 before starting exports; startup is not
complete merely because the worker process has been launched.
Configure the local API process with the same token, `PRINT_QA_URL=http://127.0.0.1:8767/check`
and `REQUIRE_COMPOSED_PRINT_QA=1`. Never put the token in source files or browser code.

With this configuration every final CMYK export waits for the composed proof.
An over-limit report returns 422 with page locations; an absent worker, wrong
PDF/profile hash, incomplete/invalid report or unavailable proof returns 503.
The proof uses 150 dpi, overprint enabled, 300% and zero tolerance. The response
header `X-Composed-Print-QA` distinguishes `pass` from `not_run`. Without a
configured worker or mandatory flag, the existing separate-QA warning remains.

The local HTTP server is a test harness, not an Internet-facing production
service. Production needs a separately hosted, authenticated and resource-limited
renderer over HTTPS. No Ghostscript binary was added to Vercel. Its 45-second
client timeout blocks the download rather than returning an unchecked PDF.

Local end-to-end verification passed through Node → HTTP worker → Ghostscript
on the supplied converted sample (298.039% max). This does not approve physical
colour matching or establish that the worker is enabled on any deployment.
