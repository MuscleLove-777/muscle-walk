"""Generate PWA icons (192/512) and og-image (1200x630) for muscle-walk."""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

OUT = Path(__file__).parent / "docs"
OUT.mkdir(exist_ok=True)

BG = (27, 67, 50)        # #1B4332
ACCENT = (245, 200, 66)  # #F5C842
PINK = (255, 64, 129)    # #ff4081

def find_emoji_font(size):
    candidates = [
        r"C:\Windows\Fonts\seguiemj.ttf",
        r"C:\Windows\Fonts\seguisym.ttf",
    ]
    for c in candidates:
        try:
            return ImageFont.truetype(c, size)
        except Exception:
            continue
    return None

def find_text_font(size, bold=True):
    paths = [
        r"C:\Windows\Fonts\YuGothB.ttc",
        r"C:\Windows\Fonts\YuGothM.ttc",
        r"C:\Windows\Fonts\meiryo.ttc",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def make_icon(size, path):
    img = Image.new("RGBA", (size, size), BG + (255,))
    d = ImageDraw.Draw(img)
    # Yellow ring frame
    pad = int(size * 0.06)
    d.rounded_rectangle([pad, pad, size-pad, size-pad], radius=int(size*0.18), outline=ACCENT, width=max(4, size//40))
    # 💪 emoji big in center
    emoji_size = int(size * 0.6)
    f = find_emoji_font(emoji_size)
    if f is not None:
        try:
            # Emoji rendering on PIL needs embedded_color for color glyphs
            d.text((size/2, size/2), "💪", font=f, anchor="mm", embedded_color=True)
        except TypeError:
            d.text((size/2, size/2), "💪", font=f, anchor="mm", fill=ACCENT)
    else:
        # Fallback: draw stylized "ML" text
        f2 = find_text_font(int(size*0.45), bold=True)
        d.text((size/2, size/2), "ML", font=f2, anchor="mm", fill=ACCENT)
    img.save(path, "PNG")
    print(f"wrote {path} ({size}x{size})")

def make_og(path):
    W, H = 1200, 630
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    # Decorative ring
    d.rounded_rectangle([20, 20, W-20, H-20], radius=24, outline=ACCENT, width=6)
    # Title
    f_title = find_text_font(78, bold=True)
    f_sub = find_text_font(36, bold=True)
    d.text((60, 130), "筋肉ウォーク", font=f_title, fill=ACCENT)
    d.text((60, 230), "〜ジャンクフード撃滅〜", font=f_sub, fill=(255,255,255))
    d.text((60, 320), "Walk → Punch → KO Junk Food", font=f_sub, fill=PINK)
    d.text((60, 520), "by MuscleLove · PWA", font=find_text_font(28), fill=(200, 220, 200))
    # 💪 on right
    fe = find_emoji_font(360)
    if fe is not None:
        try:
            d.text((900, 315), "💪", font=fe, anchor="mm", embedded_color=True)
        except TypeError:
            d.text((900, 315), "💪", font=fe, anchor="mm", fill=ACCENT)
    img.save(path, "PNG")
    print(f"wrote {path} (og)")

if __name__ == "__main__":
    make_icon(192, OUT / "icon-192.png")
    make_icon(512, OUT / "icon-512.png")
    make_og(OUT / "og-image.png")
