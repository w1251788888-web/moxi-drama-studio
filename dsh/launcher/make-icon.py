#!/usr/bin/env python3
"""生成墨戏生花 macOS 应用图标（墨滴 + 场记板，朱砂印）。输出 dsh/launcher/Moxi.icns。"""
import os
import shutil
import subprocess
import sys

from PIL import Image, ImageDraw

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
ICNS = os.path.join(OUT_DIR, 'Moxi.icns')
ICONSET = '/tmp/Moxi.iconset'


def draw_icon(size: int = 1024) -> Image.Image:
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 1024
    d.rounded_rectangle([40 * s, 40 * s, 984 * s, 984 * s], radius=200 * s, fill=(244, 240, 231, 255))
    d.ellipse([190 * s, 170 * s, 470 * s, 450 * s], fill=(37, 42, 43, 235))
    d.polygon([(330 * s, 110 * s), (200 * s, 300 * s), (460 * s, 300 * s)], fill=(37, 42, 43, 235))
    d.rounded_rectangle([470 * s, 560 * s, 860 * s, 830 * s], radius=26 * s, outline=(164, 71, 54, 255), width=int(26 * s))
    d.line([470 * s, 640 * s, 860 * s, 640 * s], fill=(164, 71, 54, 255), width=int(20 * s))
    for x in (520, 620, 720):
        d.line([x * s, 570 * s, (x + 70) * s, 625 * s], fill=(164, 71, 54, 255), width=int(16 * s))
    d.rounded_rectangle([640 * s, 190 * s, 800 * s, 300 * s], radius=16 * s, outline=(164, 71, 54, 220), width=int(12 * s))
    return img


def main() -> int:
    img = draw_icon()
    shutil.rmtree(ICONSET, ignore_errors=True)
    os.makedirs(ICONSET, exist_ok=True)
    for size in (16, 32, 64, 128, 256, 512):
        img.resize((size, size), Image.LANCZOS).save(f'{ICONSET}/icon_{size}x{size}.png')
        if size <= 256:
            img.resize((size * 2, size * 2), Image.LANCZOS).save(f'{ICONSET}/icon_{size}x{size}@2x.png')
    subprocess.run(['iconutil', '-c', 'icns', ICONSET, '-o', ICNS], check=True)
    print(ICNS)
    return 0


if __name__ == '__main__':
    sys.exit(main())
