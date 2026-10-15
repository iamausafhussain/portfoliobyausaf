#!/usr/bin/env python3
"""
Still images of the globe for the low tier, Lite mode and no-WebGL browsers (spec 05 TF-1).
Drawn from the same land dots as the 3D globe, in the design-token colours, so the
fallback looks like a frame of the real thing.

    python3 scripts/render-globe-stills.py     # needs numpy + Pillow; run after build-globe-data.mjs

Writes src/scene/globe/data/globe-{dark,light}.webp
"""
import math
import os
import re
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
SIZE = 520          # image size in px (shown at up to 260 css px, so sharp at 2x)
R = 220             # globe radius in px
CENTRE = (18.0, 84.0)  # lat, lng facing the viewer: India, with home (Bhubaneswar) near the middle
HOME = (20.30, 85.82)


def tokens():
    """Reads the theme colours from src/theme/tokens.ts (the single source of truth)."""
    src = open(os.path.join(ROOT, 'src/theme/tokens.ts')).read()
    out = {}
    for theme in ('dark', 'light'):
        block = src[src.index(f'  {theme}: {{'):]
        block = block[: block.index('effect:')]
        out[theme] = {k: v for k, v in re.findall(r"(\w+): '(#[0-9A-Fa-f]{6})'", block)}
    return out


def hex_rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def load_dots():
    data = open(os.path.join(ROOT, 'src/scene/globe/data/land-dots.bin'), 'rb').read()
    high, mid = struct.unpack_from('<II', data, 0)
    # the lighter (mid-tier) set: at this size it reads cleaner and compresses better
    vals = np.frombuffer(data, dtype='<i2', offset=8 + high * 4, count=mid * 2).reshape(-1, 2) / 100.0
    return vals


def project(lat, lng):
    """Orthographic projection around CENTRE. Returns x, y (px) and depth (>0 = facing us)."""
    la, lo = np.radians(lat), np.radians(lng)
    la0, lo0 = math.radians(CENTRE[0]), math.radians(CENTRE[1])
    x = np.cos(la) * np.sin(lo - lo0)
    y = math.cos(la0) * np.sin(la) - math.sin(la0) * np.cos(la) * np.cos(lo - lo0)
    z = math.sin(la0) * np.sin(la) + math.cos(la0) * np.cos(la) * np.cos(lo - lo0)
    return SIZE / 2 + x * R, SIZE / 2 - y * R, z


def render(theme, c):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    base = hex_rgb(c['globeBase'])
    fg = hex_rgb(c['fg'])
    accent = hex_rgb(c['accent'])
    accent2 = hex_rgb(c['accent2'])
    cx = cy = SIZE / 2

    # atmosphere rim: a soft ring just outside the sphere
    rim = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    rd = ImageDraw.Draw(rim)
    ring = accent2 if theme == 'dark' else fg
    rd.ellipse([cx - R - 6, cy - R - 6, cx + R + 6, cy + R + 6], outline=ring + (110 if theme == 'dark' else 40,), width=6)
    rim = rim.filter(ImageFilter.GaussianBlur(7))
    img.alpha_composite(rim)

    # sphere
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=base + (255,))
    if theme == 'light':
        # a soft shadow edge so the porcelain sphere reads against the light page
        shade = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        ImageDraw.Draw(shade).ellipse([cx - R, cy - R, cx + R, cy + R], outline=fg + (40,), width=2)
        img.alpha_composite(shade)

    # land dots, dimmer towards the edge
    dots = load_dots()
    x, y, z = project(dots[:, 0], dots[:, 1])
    dot_col = fg if theme == 'dark' else fg
    for xi, yi, zi in zip(x, y, z):
        if zi <= 0.02:
            continue
        a = int(70 + 150 * zi) if theme == 'dark' else int(60 + 130 * zi)
        r = 1.4 + 1.0 * zi
        d.ellipse([xi - r, yi - r, xi + r, yi + r], fill=dot_col + (a,))

    # home node with a halo (dark) or a crisp ring (light)
    hx, hy, _ = project(np.array([HOME[0]]), np.array([HOME[1]]))
    hx, hy = float(hx[0]), float(hy[0])
    if theme == 'dark':
        glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        ImageDraw.Draw(glow).ellipse([hx - 16, hy - 16, hx + 16, hy + 16], fill=accent + (150,))
        img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(8)))
    else:
        d.ellipse([hx - 11, hy - 11, hx + 11, hy + 11], outline=accent + (200,), width=2)
    d.ellipse([hx - 5, hy - 5, hx + 5, hy + 5], fill=accent + (255,))

    out = os.path.join(ROOT, f'src/scene/globe/data/globe-{theme}.webp')
    img.save(out, 'WEBP', quality=58, method=6)
    print(out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    t = tokens()
    for theme in ('dark', 'light'):
        render(theme, t[theme])
