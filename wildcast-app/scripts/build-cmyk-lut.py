# Builds the sRGB -> CMYK lookup tables api/export-cmyk.js uses for the
# "CMYK-only" export. sharp only offers Perceptual intent (hard-coded in
# libvips' sharp binding, still true in 0.35), so the conversion print shops
# and InDesign's "Convert to Destination" use - Relative Colorimetric with
# black point compensation - is precomputed here with LittleCMS (via Pillow)
# into a 33x33x33 grid (a 65-grid measured identical, dE mean 0.14 vs direct LittleCMS) per output profile, and interpolated at export time.
#
# Run from wildcast-app/:  python scripts/build-cmyk-lut.py
# Output: api/icc/<profile>.relcol-bpc.lut  (header "WCLUT1", grid size N,
# then N^3 CMYK byte quadruplets, R slowest / B fastest).
import sys
from PIL import Image, ImageCms

N = 33
PROFILES = ['PSOcoated_v3.icc', 'ISOcoated_v2_eci.icc']

def build(profile_file):
    src = ImageCms.createProfile('sRGB')
    dst = ImageCms.getOpenProfile(f'api/icc/{profile_file}')
    xf = ImageCms.buildTransform(src, dst, 'RGB', 'CMYK', renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                 flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
    grid = Image.new('RGB', (N * N, N))
    step = 255 / (N - 1)
    for r in range(N):
        for g in range(N):
            for b in range(N):
                grid.putpixel((r * N + g, b), tuple(round(v * step) for v in (r, g, b)))
    cmyk = ImageCms.applyTransform(grid, xf)
    out = bytearray(b'WCLUT1' + bytes([N]))
    for r in range(N):
        for g in range(N):
            for b in range(N):
                out += bytes(cmyk.getpixel((r * N + g, b)))
    path = f"api/icc/{profile_file.rsplit('.', 1)[0]}.relcol-bpc.lut"
    open(path, 'wb').write(out)
    print(path, len(out), 'bytes')

for p in (sys.argv[1:] or PROFILES):
    build(p)
