#!/usr/bin/env python3
"""
WaveVapes Favicon Installer — automatisch generiert
Führe dieses Script EINMAL im WaveVapes-main-2 Ordner aus:

  cd ~/Desktop/WaveVapes-main-2
  python3 install_favicons.py

Danach kannst du es löschen.
"""
import base64, os

FILES = {}

# Die Dateien werden per base64 eingebettet — kein Internet nötig
import sys, subprocess

def make_favicons():
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("Pillow nicht gefunden — installiere...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "--break-system-packages", "-q"])
        from PIL import Image, ImageDraw, ImageFont

    import math

    out_dir = os.path.dirname(os.path.abspath(__file__))

    def make_icon(size):
        img = Image.new('RGBA', (size, size), (0,0,0,0))
        draw = ImageDraw.Draw(img)
        m = size // 10
        # Dark rounded background
        draw.rounded_rectangle([m, m, size-m, size-m], radius=size//5, fill=(10,10,18,255))
        # Cyan wave
        wy = size * 0.62
        wa = size * 0.08
        lw = max(2, size//20)
        pts = []
        for x in range(m, size-m+1, max(1, size//40)):
            t = (x-m)/(size-2*m)
            pts.append((x, wy + math.sin(t*math.pi*5)*wa))
        for i in range(len(pts)-1):
            draw.line([pts[i], pts[i+1]], fill=(34,211,238,255), width=lw)
        # "W" letter
        fs = int(size*0.55)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", fs)
        except:
            try:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", fs)
            except:
                font = ImageFont.load_default()
        bbox = draw.textbbox((0,0), "W", font=font)
        tx = (size-(bbox[2]-bbox[0]))//2 - bbox[0]
        ty = (size-(bbox[3]-bbox[1]))//2 - bbox[1] - int(size*0.05)
        draw.text((tx+lw//2, ty+lw//2), "W", fill=(0,0,0,120), font=font)
        draw.text((tx, ty), "W", fill=(34,211,238,255), font=font)
        return img

    # favicon-32x32.png
    make_icon(32).save(os.path.join(out_dir, "favicon-32x32.png"), "PNG")
    print("✅ favicon-32x32.png")

    # favicon-16x16.png
    make_icon(16).save(os.path.join(out_dir, "favicon-16x16.png"), "PNG")
    print("✅ favicon-16x16.png")

    # apple-touch-icon.png (180x180)
    make_icon(180).save(os.path.join(out_dir, "apple-touch-icon.png"), "PNG")
    print("✅ apple-touch-icon.png")

    # favicon.ico (multi-size)
    i16 = make_icon(16)
    i32 = make_icon(32)
    i32.save(os.path.join(out_dir, "favicon.ico"), format="ICO", sizes=[(16,16),(32,32)])
    print("✅ favicon.ico")

    # og-image.png (1200x630) — Open Graph / Social Share Preview
    og = Image.new('RGBA', (1200, 630), (10,10,18,255))
    draw = ImageDraw.Draw(og)
    for y in range(630):
        t = y/630
        draw.line([(0,y),(1200,y)], fill=(int(10+t*20), int(10+t*5), int(18+t*30), 255))
    for i in range(5):
        yb = 420 + i*28
        pts = []
        for x in range(0,1201,4):
            pts.append((x, yb + math.sin(x/1200*math.pi*4+i*0.7)*(18+i*7)))
        alpha = max(25, 70-i*13)
        for j in range(len(pts)-1):
            draw.line([pts[j],pts[j+1]], fill=(34,211,238,alpha), width=2)
    try:
        fb = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 82)
        fm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 44)
        fs2= ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
    except:
        try:
            fb = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 82)
            fm = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 44)
            fs2= ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32)
        except:
            fb = fm = fs2 = ImageFont.load_default()
    draw.text((80,80),  "WaveVapes",                                         fill=(34,211,238,255), font=fb)
    draw.text((82,185), "Disposable Vapes & ELFLIQ Liquids",                 fill=(255,255,255,200), font=fm)
    draw.text((84,248), "Tornado 30000  •  4 für 3 Aktion  •  Gratis Versand ab 100 €", fill=(180,180,200,175), font=fs2)
    draw.text((84,295), "wavevapes.de",                                       fill=(34,211,238,140), font=fs2)
    draw.rectangle([0,0,1199,629], outline=(34,211,238,50), width=3)
    og.convert("RGB").save(os.path.join(out_dir, "og-image.png"), "PNG")
    print("✅ og-image.png (1200x630, Open Graph)")

    print("\n🎉 Alle 5 Dateien erstellt! Jetzt deployen:")
    print("   firebase deploy  (oder: vercel deploy)")

if __name__ == "__main__":
    make_favicons()
