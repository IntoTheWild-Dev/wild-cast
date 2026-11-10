"""Local/CI CMYK process-ink proof; requires Ghostscript, Pillow and pypdf.

Uses tiffsep with overprint enabled. This is not a physical colour approval,
certified PDF/X validator, or a serverless export dependency.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from PIL import Image
from pypdf import PdfReader


def inspect_page(image, dpi, limit, tolerance):
    if image.mode != 'CMYK':
        raise ValueError('Renderer did not produce four-channel CMYK.')
    data = image.tobytes()
    width, height = image.size
    maximum, max_pixel, count = -1, (0, 0), 0
    left, top, right, bottom = width, height, -1, -1
    threshold = (limit + tolerance) * 255 / 100
    for pixel in range(width * height):
        offset = pixel * 4
        total = sum(data[offset:offset + 4])
        x, y = pixel % width, pixel // width
        if total > maximum:
            maximum, max_pixel = total, (x, y)
        if total > threshold:
            count += 1
            left, top, right, bottom = min(left, x), min(top, y), max(right, x), max(bottom, y)
    mm = lambda value: round(value * 25.4 / dpi, 3)
    return {
        'status': 'fail' if count else 'pass',
        'max_ink_percent': round(maximum / 255 * 100, 3),
        'max_at_mm_from_top_left': [mm(v) for v in max_pixel],
        'over_limit_pixels': count,
        'over_limit_bounds_mm': [mm(left), mm(top), mm(right + 1), mm(bottom + 1)] if count else None,
        'raster_size': [width, height],
    }


def composed_report(pdf, icc, dpi=150, limit=300, tolerance=0):
    gs = shutil.which('gs')
    if not gs:
        raise RuntimeError('Ghostscript is unavailable; composed-page check was not performed.')
    pdf, icc = Path(pdf).resolve(strict=True), Path(icc).resolve(strict=True)
    profile = icc.read_bytes()
    if profile[12:20] != b'prtrCMYK':
        raise ValueError('Expected a CMYK output ICC profile.')
    digest = hashlib.sha256(profile).hexdigest()
    reader = PdfReader(pdf)
    intents = reader.trailer['/Root'].get('/OutputIntents', [])
    profiles = [item.get_object().get('/DestOutputProfile') for item in intents]
    if not any(ref and hashlib.sha256(ref.get_object().get_data()).hexdigest() == digest for ref in profiles):
        raise ValueError('The PDF does not embed the exact selected output ICC profile; export it again with that profile.')
    version = subprocess.run([gs, '--version'], capture_output=True, text=True, check=True).stdout.strip()
    with tempfile.TemporaryDirectory(prefix='wildcast-ink-') as temporary:
        target = str(Path(temporary) / 'page-%04d.tif')
        args = [gs, '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=tiffsep',
                '-dNoSeparationFiles', '-dOverprint=/enable', f'-r{dpi}',
                f'-sDefaultCMYKProfile={icc}', f'-sOutputICCProfile={icc}',
                f'-sOutputFile={target}', '-f', str(pdf)]
        rendered = subprocess.run(args, capture_output=True, text=True, timeout=120)
        if rendered.returncode:
            raise RuntimeError('Composed-page rendering failed: ' + rendered.stderr[-2000:])
        pages = sorted(Path(temporary).glob('page-*.tif'))
        if len(pages) != len(reader.pages):
            raise RuntimeError('Not every PDF page was rendered; check is incomplete.')
        reports = []
        for number, path in enumerate(pages, 1):
            with Image.open(path) as image:
                reports.append({'page': number, **inspect_page(image, dpi, limit, tolerance)})
    return {
        'file': str(pdf), 'profile_sha256': digest, 'ghostscript_version': version,
        'device': 'tiffsep', 'overprint': 'enable', 'dpi': dpi,
        'renderer_messages': (rendered.stdout + '\n' + rendered.stderr).strip()[-4000:],
        'ink_limit_percent': limit, 'tolerance_percentage_points': tolerance,
        'status': 'pass' if all(p['status'] == 'pass' for p in reports) else 'fail',
        'pages': reports,
        'limitations': 'Raster proof at the stated resolution, process inks only; not a physical colour match or a certified PDF/X validation.',
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf')
    parser.add_argument('--icc', required=True)
    parser.add_argument('--dpi', type=int, default=150)
    parser.add_argument('--limit', type=float, default=300)
    parser.add_argument('--tolerance', type=float, default=0, help='Explicit allowance in percentage points; raw maxima are always reported. Default is zero.')
    args = parser.parse_args()
    if not 72 <= args.dpi <= 600 or not 0 < args.limit <= 400 or not 0 <= args.tolerance <= 1:
        parser.error('DPI must be 72–600, ink limit 0–400 and tolerance 0–1.')
    try:
        report = composed_report(args.pdf, args.icc, args.dpi, args.limit, args.tolerance)
    except Exception as error:
        print(json.dumps({'status': 'not_checked', 'error': str(error)}))
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report['status'] == 'pass' else 1


if __name__ == '__main__':
    sys.exit(main())
