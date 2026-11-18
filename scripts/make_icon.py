# 產生程式圖示：小柯機器人（頭盔造型）＋金色六角螺絲與藍色六角螺帽
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024


def layer():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)


img = layer()
bg = layer()
d = ImageDraw.Draw(bg)
d.rounded_rectangle((36, 36, 988, 988), 190, fill=(26, 58, 110, 255))
d.rounded_rectangle((70, 70, 954, 954), 164, fill=(232, 240, 250, 255))
img = Image.alpha_composite(img, bg)

GOLD = (236, 176, 40)
BLUE = (52, 132, 226)

# --- 螺絲：斜放的六角頭＋螺紋桿（側視，帶透視的橢圓） ------------------------------
bolt = layer()
b = ImageDraw.Draw(bolt)
cx, top = 360, 250          # 頭部頂面中心
hw, hh, ell = 150, 120, 46  # 頭部半寬、高度、橢圓半高
# 頭部側面：三個面
faces = [(-hw, -hw / 2, 0.72), (-hw / 2, hw / 2, 1.0), (hw / 2, hw, 0.82)]
for x0, x1, k in faces:
    b.polygon([(cx + x0, top + ell * (0.5 if abs(x0) == hw else 1)), (cx + x1, top + ell * (0.5 if abs(x1) == hw else 1)),
               (cx + x1, top + hh + ell * (0.5 if abs(x1) == hw else 1)), (cx + x0, top + hh + ell * (0.5 if abs(x0) == hw else 1))],
              fill=shade(GOLD, k))
# 頭部頂面：六角形
hexagon = [(cx + hw * math.cos(a), top + ell * math.sin(a)) for a in [i * math.pi / 3 for i in range(6)]]
b.polygon(hexagon, fill=shade(GOLD, 1.18))
b.polygon(hexagon, outline=shade(GOLD, 0.6), width=5)
# 內六角孔
hole = [(cx + 52 * math.cos(a + math.pi / 6), top + 17 * math.sin(a + math.pi / 6)) for a in [i * math.pi / 3 for i in range(6)]]
b.polygon(hole, fill=shade(GOLD, 0.45))
# 螺桿
r, y0, y1 = 70, top + hh + ell - 8, 860
b.rectangle((cx - r, y0, cx + r, y1), fill=shade(GOLD, 0.95))
b.rectangle((cx - r, y0, cx - r + 34, y1), fill=shade(GOLD, 0.75))
b.rectangle((cx + r - 30, y0, cx + r, y1), fill=shade(GOLD, 0.8))
# 斜向螺紋
pitch = 46
y = y0 + 20
while y < y1 - 10:
    b.line([(cx - r - 10, y + 12), (cx + r + 10, y - 12)], fill=shade(GOLD, 0.55), width=16)
    b.line([(cx - r - 10, y + 2), (cx + r + 10, y - 22)], fill=shade(GOLD, 1.2), width=6)
    y += pitch
b.ellipse((cx - r, y1 - 22, cx + r, y1 + 22), fill=shade(GOLD, 0.7))
sh = layer()
ImageDraw.Draw(sh).ellipse((cx - 170, 830, cx + 230, 920), fill=(0, 0, 0, 80))
img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(20)))
img = Image.alpha_composite(img, bolt)

# --- 螺帽：右下 -------------------------------------------------------------------
nut = layer()
n = ImageDraw.Draw(nut)
nx, ny, nw, nh, ne = 700, 640, 165, 110, 62
for x0, x1, k in [(-nw, -nw / 2, 0.7), (-nw / 2, nw / 2, 1.0), (nw / 2, nw, 0.82)]:
    f0 = 0.5 if abs(x0) == nw else 1
    f1 = 0.5 if abs(x1) == nw else 1
    n.polygon([(nx + x0, ny + ne * f0), (nx + x1, ny + ne * f1), (nx + x1, ny + nh + ne * f1), (nx + x0, ny + nh + ne * f0)], fill=shade(BLUE, k))
hexn = [(nx + nw * math.cos(a), ny + ne * math.sin(a)) for a in [i * math.pi / 3 for i in range(6)]]
n.polygon(hexn, fill=shade(BLUE, 1.25))
n.polygon(hexn, outline=shade(BLUE, 0.6), width=5)
n.ellipse((nx - 72, ny - 27, nx + 72, ny + 27), fill=shade(BLUE, 0.45))
for i in range(3):
    n.arc((nx - 72 + i * 6, ny - 27 + i * 3, nx + 72 - i * 6, ny + 27 - i * 3), 200, 340, fill=shade(BLUE, 0.85), width=5)
sh3 = layer()
ImageDraw.Draw(sh3).ellipse((nx - 190, ny + 120, nx + 200, ny + 230), fill=(0, 0, 0, 80))
img = Image.alpha_composite(img, sh3.filter(ImageFilter.GaussianBlur(20)))
img = Image.alpha_composite(img, nut)

# --- 小柯機器人（頭盔造型），右上 ---------------------------------------------------
rb = layer()
r_ = ImageDraw.Draw(rb)
cx, cy = 730, 300
s = 0.72


def R(a, b, c, e):
    return (cx + a * s, cy + b * s, cx + c * s, cy + e * s)


r_.line((cx, cy - 250 * s, cx, cy - 190 * s), fill=(90, 100, 120, 255), width=16)
r_.ellipse(R(-34, -290, 34, -222), fill=(255, 196, 40, 255))
r_.rounded_rectangle(R(-262, -70, -210, 80), 20, fill=(40, 120, 220, 255))
r_.rounded_rectangle(R(210, -70, 262, 80), 20, fill=(40, 120, 220, 255))
r_.ellipse(R(-230, -210, 230, 220), fill=(70, 150, 240, 255))
r_.ellipse(R(-214, -196, 214, 200), fill=(240, 246, 255, 255))
r_.rounded_rectangle(R(-170, -110, 170, 90), int(90 * s), fill=(24, 36, 64, 255))
for ex in (-72, 72):
    r_.arc(R(ex - 46, -50, ex + 46, 30), 200, 340, fill=(90, 230, 255, 255), width=18)
r_.arc(R(-50, 10, 50, 70), 20, 160, fill=(90, 230, 255, 255), width=12)
r_.ellipse(R(-160, 40, -110, 80), fill=(255, 140, 160, 200))
r_.ellipse(R(110, 40, 160, 80), fill=(255, 140, 160, 200))
sh2 = layer()
ImageDraw.Draw(sh2).ellipse(R(-240, -190, 260, 260), fill=(0, 0, 0, 110))
img = Image.alpha_composite(img, sh2.filter(ImageFilter.GaussianBlur(22)))
img = Image.alpha_composite(img, rb)

os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True)
img.save(os.path.join(ROOT, 'build', 'icon.png'))
img.save(os.path.join(ROOT, 'build', 'icon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
pub = os.path.join(ROOT, 'public')
os.makedirs(pub, exist_ok=True)
img.resize((512, 512), Image.LANCZOS).save(os.path.join(pub, 'icon-512.png'))
img.resize((192, 192), Image.LANCZOS).save(os.path.join(pub, 'icon-192.png'))
img.resize((180, 180), Image.LANCZOS).save(os.path.join(pub, 'apple-touch-icon.png'))
img.resize((64, 64), Image.LANCZOS).save(os.path.join(pub, 'favicon.png'))
# iPhone／iPad：App 圖示（不透明，iOS 會自己裁圓角）與線上安裝頁圖示
full = Image.new('RGBA', (S, S), (26, 58, 110, 255))
full = Image.alpha_composite(full, img)
appicon = os.path.join(ROOT, 'ios', 'XiaokeScrew', 'Assets.xcassets', 'AppIcon.appiconset')
if os.path.isdir(appicon):
    full.convert('RGB').save(os.path.join(appicon, 'icon-1024.png'))
pios = os.path.join(pub, 'ios')
if os.path.isdir(pios):
    for n in (512, 180, 57):
        full.convert('RGB').resize((n, n), Image.LANCZOS).save(os.path.join(pios, f'icon-{n}.png'))
    try:
        import qrcode
        qrcode.make('https://achir1015.github.io/xiaoke-screw/ios/', box_size=8, border=2).save(os.path.join(pios, 'qr.png'))
        print('qr ok')
    except ImportError:
        print('沒有 qrcode 套件，QR Code 沒更新')
print('icon ok')
