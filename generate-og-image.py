#!/usr/bin/env python3
"""
WaveVapes — OG-Image Generator
Generiert og-image.png (1200x630) für Social Media Previews.
SVG-OG-Images werden von WhatsApp, Telegram, Facebook, LinkedIn NICHT angezeigt.
Dieses Script erstellt ein kompatibles PNG.

Usage:
    pip install Pillow
    python3 generate-og-image.py
"""

from PIL import Image, ImageDraw, ImageFont
import os, sys

W, H = 1200, 630
script_dir = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(script_dir, 'og-image.png')

img = Image.new('RGB', (W, H), '#060612')
draw = ImageDraw.Draw(img)

# Background gradient
for y in range(H):
    for x in range(0, W, 2):
        t = (x / W * 0.6 + y / H * 0.4)
        r = int(6  + 18 * t)
        g = int(6  + 12 * t)
        b = int(18 + 45 * t)
        draw.rectangle([x, y, x+1, y], fill=(r, g, b))

# Try system fonts, fallback to default
def load_font(size, bold=True):
    candidates = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' if bold else
        '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    ]
    for p in candidates:
        try:
            return ImageFont.truetype(p, size)
        except:
            pass
    return ImageFont.load_default()

fnt_logo   = load_font(36)
fnt_hero1  = load_font(60)
fnt_hero2  = load_font(60)
fnt_tag    = load_font(13, bold=False)
fnt_badge  = load_font(20)
fnt_small  = load_font(13, bold=False)
fnt_url    = load_font(26)
fnt_w      = load_font(48)

CYAN    = '#22d3ee'
CYAN_LT = '#67e8f9'
PURPLE  = '#a78bfa'
RED     = '#ef4444'
GREEN   = '#34d399'
WHITE   = '#ffffff'
GRAY    = '#9ca3af'
DIM     = '#4b5563'
GOLD    = '#fbbf24'

# Top accent line
draw.rectangle([0, 0, W, 4], fill=CYAN)

# Logo circle
draw.ellipse([60, 48, 164, 152], outline=CYAN, width=2)
draw.text((112, 100), 'W', font=fnt_w, fill=CYAN, anchor='mm')

# Brand name
draw.text((185, 70),  'Wave',  font=fnt_logo, fill=WHITE)
draw.text((185, 108), 'Vapes', font=fnt_logo, fill=CYAN)
draw.text((185, 148), 'PREMIUM VAPE SHOP · DEUTSCHLAND', font=fnt_small, fill=DIM)

# Divider
draw.rectangle([60, 178, W-60, 179], fill='#1c1c2e')

# Headline
draw.text((W//2, 250), 'Disposable Vapes &', font=fnt_hero1, fill=WHITE,   anchor='mm')
draw.text((W//2, 325), 'ELFLIQ Liquids kaufen',  font=fnt_hero2, fill=CYAN, anchor='mm')

# Badges
badges = [
    (60,  390, 295, 475, RED,    '4 FUR 3',          'Aktion · automatisch im Warenkorb'),
    (315, 390, 570, 475, CYAN_LT,'TORNADO 30000',     'bis 30.000 Zuge · 20+ Sorten'),
    (590, 390, 845, 475, PURPLE, 'ab 7,99 EUR',       'ELFLIQ NicSalt · 25+ Sorten'),
    (865, 390, 1145,475, GREEN,  'Gratis DHL-Versand','ab 100 EUR · inkl. Mystery Vape'),
]
for x1, y1, x2, y2, color, title, sub in badges:
    cx = (x1+x2)//2
    cy = (y1+y2)//2
    draw.rounded_rectangle([x1, y1, x2, y2], radius=16, outline=color, width=2)
    draw.text((cx, cy-12), title, font=fnt_badge, fill=color, anchor='mm')
    draw.text((cx, cy+16), sub,   font=fnt_small, fill=GRAY,  anchor='mm')

# Bottom bar
draw.rectangle([0, 548, W, H], fill=(4, 4, 12))
draw.rectangle([0, 548, W, 549], fill='#1c1c2e')

# Stars
draw.text((80, 588), '\u2605\u2605\u2605\u2605\u2605', font=fnt_small, fill=GOLD)
draw.text((185,588), '4.9/5 \xb7 uber 100 Bewertungen', font=fnt_small, fill=DIM)

# URL
draw.text((W//2, 582), 'wavevapes.de', font=fnt_url, fill=CYAN, anchor='mm')
draw.text((W//2, 612), 'LOYALTY PUNKTE \xb7 MYSTERY VAPE \xb7 NUR 18+', font=fnt_small, fill=DIM, anchor='mm')

# 18+ badge
draw.rounded_rectangle([1090, 62, 1162, 100], radius=8, outline=RED, width=2)
draw.text((1126, 81), '18+', font=fnt_badge, fill=RED, anchor='mm')

# Bottom accent line
draw.rectangle([0, H-4, W, H], fill=PURPLE)

img.save(out_path, 'PNG', optimize=True, compress_level=9)
size_kb = os.path.getsize(out_path) / 1024
print(f'✅ og-image.png generiert: {out_path} ({size_kb:.1f} KB)')
print('Jetzt alle og:image Meta-Tags von /og-image.svg auf /og-image.png umstellen.')
