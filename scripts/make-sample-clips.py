#!/usr/bin/env python3
"""
Generates the sample hero clips (spec 04 Q7): a slow, seamlessly looping "drone"
flyover of a made-up landscape, one at dusk (dark theme) and one by day (light theme).
They stand in until Ausaf uploads his own footage from the admin.

    python3 scripts/make-sample-clips.py     # needs numpy + ffmpeg (libx264, libvpx-vp9, libwebp)

Writes public/hero-sample/{dusk,day}.{mp4,webm}, {dusk,day}-phone.mp4 and {dusk,day}.webp.
"""
import os
import subprocess
import sys

import numpy as np

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'hero-sample')
W, H = 1280, 720
FPS = 24
SECONDS = 16
TILE = 1024          # the noise repeats every TILE samples, so panning one tile loops seamlessly
SCALE = 1.5          # on-screen pixels per noise sample


def periodic_noise(n, beta, seed):
    """Spectral synthesis: 1/f^beta noise that tiles perfectly (it's a Fourier series)."""
    rng = np.random.default_rng(seed)
    fx = np.fft.fftfreq(n)[:, None]
    fy = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = f ** (-beta / 2)
    amp[0, 0] = 0
    phase = rng.uniform(0, 2 * np.pi, (n, n))
    field = np.real(np.fft.ifft2(amp * np.exp(1j * phase)))
    field -= field.min()
    return field / field.max()


def ramp(t, stops):
    """Colour ramp: stops = [(position, (r, g, b)), …] with 0–255 colours."""
    pos = np.array([s[0] for s in stops])
    cols = np.array([s[1] for s in stops], dtype=np.float32)
    out = np.empty(t.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(t, pos, cols[:, c])
    return out


def render_world(kind):
    height = periodic_noise(TILE, 3.4, 7)
    detail = periodic_noise(TILE, 2.2, 11)
    h = 0.82 * height + 0.18 * detail
    # hill shading from a low sun
    gy, gx = np.gradient(h * 60)
    sun = np.array([-0.6, -0.5, 0.62]) if kind == 'dusk' else np.array([-0.4, -0.55, 0.73])
    sun = sun / np.linalg.norm(sun)
    nz = 1 / np.sqrt(gx * gx + gy * gy + 1)
    shade = np.clip((-gx * sun[0] - gy * sun[1] + sun[2]) * nz, 0, 1)

    water = h < 0.36
    if kind == 'dusk':
        land = ramp(h, [(0.36, (18, 30, 46)), (0.5, (24, 52, 60)), (0.7, (40, 62, 70)), (1.0, (92, 96, 112))])
        land *= (0.35 + 0.9 * shade)[..., None]
        sea = ramp(h, [(0.0, (30, 20, 52)), (0.3, (120, 60, 96)), (0.36, (236, 128, 104))])
        img = np.where(water[..., None], sea, land)
        # scattered warm lights near the shore (a few towns)
        rng = np.random.default_rng(3)
        lights = periodic_noise(TILE, 1.0, 5)
        towns = (h > 0.37) & (h < 0.47) & (lights > 0.72) & (rng.random(h.shape) > 0.55)
        img[towns] = np.maximum(img[towns], (255, 200, 120))
    else:
        land = ramp(h, [(0.36, (214, 200, 160)), (0.42, (120, 160, 92)), (0.65, (64, 116, 72)), (1.0, (160, 150, 130))])
        land *= (0.6 + 0.55 * shade)[..., None]
        sea = ramp(h, [(0.0, (22, 70, 120)), (0.3, (48, 120, 160)), (0.36, (120, 190, 200))])
        img = np.where(water[..., None], sea, land)
    clouds = periodic_noise(TILE, 3.0, 23)
    return np.clip(img, 0, 255), clouds


def frames(kind):
    world, clouds = render_world(kind)
    n = SECONDS * FPS
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    # vignette and atmosphere
    v = ((xs / W - 0.5) ** 2 + (ys / H - 0.5) ** 2) ** 0.5
    vignette = np.clip(1.15 - v * 1.1, 0, 1)[..., None]
    haze = np.array((60, 40, 80) if kind == 'dusk' else (230, 236, 244), np.float32)
    for i in range(n):
        t = i / n
        # pan exactly one tile diagonally over the loop (seamless), slight drift sideways
        ox = t * TILE
        oy = t * TILE * 0.5 + 18 * np.sin(2 * np.pi * t)
        u = ((xs / SCALE + ox) % TILE).astype(np.int32)
        w = ((ys / SCALE + oy) % TILE).astype(np.int32)
        frame = world[w, u]
        # clouds move twice as fast (two tiles per loop), giving parallax depth
        cu = ((xs / (SCALE * 1.6) + 2 * t * TILE) % TILE).astype(np.int32)
        cw = ((ys / (SCALE * 1.6) + t * TILE) % TILE).astype(np.int32)
        c = np.clip((clouds[cw, cu] - 0.55) * 2.6, 0, 0.75)[..., None]
        cloud_col = np.array((70, 56, 96) if kind == 'dusk' else (250, 252, 255), np.float32)
        frame = frame * (1 - c) + cloud_col * c
        frame = frame * 0.88 + haze * 0.12
        frame = frame * vignette
        yield np.clip(frame, 0, 255).astype(np.uint8)


def ffmpeg(args, stdin=None):
    return subprocess.Popen(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], stdin=stdin)


def make(kind):
    master = os.path.join(OUT, f'.{kind}-master.mkv')
    p = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', '-pix_fmt', 'yuv420p', master],
               stdin=subprocess.PIPE)
    for f in frames(kind):
        p.stdin.write(f.tobytes())
    p.stdin.close()
    if p.wait():
        sys.exit('ffmpeg failed')

    jobs = [
        ['-i', master, '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p',
         '-movflags', '+faststart', '-an', os.path.join(OUT, f'{kind}.mp4')],
        ['-i', master, '-c:v', 'libvpx-vp9', '-crf', '40', '-b:v', '0', '-row-mt', '1', '-an',
         os.path.join(OUT, f'{kind}.webm')],
        ['-i', master, '-vf', 'scale=640:360', '-c:v', 'libx264', '-crf', '28', '-preset', 'slow',
         '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', os.path.join(OUT, f'{kind}-phone.mp4')],
        ['-i', master, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '72', os.path.join(OUT, f'{kind}.webp')],
    ]
    for j in jobs:
        if ffmpeg(j).wait():
            sys.exit('ffmpeg failed')
    os.remove(master)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for kind in ('dusk', 'day'):
        make(kind)
        print('made', kind)
