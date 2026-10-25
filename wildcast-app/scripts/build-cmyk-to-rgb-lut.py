# Builds the CMYK -> sRGB lookup table the Print colours setting uses to show
# what a typed CMYK value looks like on screen (and to fill its HEX/RGB).
# Same engine and intent as build-cmyk-lut.py: LittleCMS via Pillow, Relative
# Colorimetric + black point compensation, 17^4 grid.
#
# Run from wildcast-app/:  python scripts/build-cmyk-to-rgb-lut.py
# Output: api/icc/<profile>.cmyk-to-srgb.lut  (header "WCRLUT1", grid size N,
# then N^4 RGB byte triplets, C slowest / K fastest).
import sys
from PIL import Image, ImageCms

N = 17
PROFILES = ['PSOcoated_v3.icc']

def build(profile_file):
    src = ImageCms.getOpenProfile(f'api/icc/{profile_file}')
    dst = ImageCms.createProfile('sRGB')
    xf = ImageCms.buildTransform(src, dst, 'CMYK', 'RGB', renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
                                 flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
    step = 255 / (N - 1)
    grid = Image.new('CMYK', (N * N, N * N))
    for c in range(N):
        for m in range(N):
            for y in range(N):
                for k in range(N):
                    grid.putpixel((c * N + m, y * N + k), tuple(round(v * step) for v in (c, m, y, k)))
    rgb = ImageCms.applyTransform(grid, xf)
    out = bytearray(b'WCRLUT1' + bytes([N]))
    for c in range(N):
        for m in range(N):
            for y in range(N):
                for k in range(N):
                    out += bytes(rgb.getpixel((c * N + m, y * N + k)))
    path = f"api/icc/{profile_file.rsplit('.', 1)[0]}.cmyk-to-srgb.lut"
    open(path, 'wb').write(out)
    print(path, len(out), 'bytes')

for p in (sys.argv[1:] or PROFILES):
    build(p)
