import math, pathlib

# The app's own palette, so the profile and the product look like one thing.
INK       = "#111820"   # --surface-inverse
ACCENT    = "#146b68"   # --accent
WARM      = "#bd4d42"   # --negative, the one window taken on the other side
PAPER     = "#f4f7f8"
MUTED     = "#7d8993"

N, FILL = 10, 0.62
# The tail can fade a long way on a banner, where the mark is large. At a 48px
# timeline avatar the same fade turns the ring into a smudge, so it gets its
# own floor and a brighter teal than the app's ink-on-white accent.
FADE_BANNER, FADE_AVATAR = 0.26, 0.42
ACCENT_BRIGHT = "#1f9c92"
DOWN_I = 2

def ring(cx, cy, r, w, bright=ACCENT, fade=FADE_BANNER):
    """Ten windows, fading behind the leading edge — a roll in motion."""
    out = []
    step = 360 / N
    span = step * FILL
    for i in range(N):
        a1 = -90 + i * step + (step - span) / 2
        a2 = a1 + span
        r1, r2 = math.radians(a1), math.radians(a2)
        x1, y1 = cx + r * math.cos(r1), cy + r * math.sin(r1)
        x2, y2 = cx + r * math.cos(r2), cy + r * math.sin(r2)
        op = 1 - (1 - fade) * (i / (N - 1))
        col = WARM if i == DOWN_I else bright
        out.append(
            f'<path d="M {x1:.2f} {y1:.2f} A {r} {r} 0 0 1 {x2:.2f} {y2:.2f}" fill="none" '
            f'stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op:.3f}"/>'
        )
    return "\n  ".join(out)

SANS = "Inter, ui-sans-serif, -apple-system, Segoe UI, Helvetica Neue, system-ui, sans-serif"
MONO = "ui-monospace, SF Mono, JetBrains Mono, Menlo, monospace"

# ---------------------------------------------------------------- avatar
# 400x400. X crops to a circle, so the mark sits well inside a full-bleed
# square rather than in a rounded card that would lose its corners.
avatar = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" fill="{INK}"/>
  {ring(200, 200, 132, 32, ACCENT_BRIGHT, FADE_AVATAR)}
</svg>'''
pathlib.Path("x-avatar.svg").write_text(avatar)

# ---------------------------------------------------------------- banner
# 1500x500. The avatar overlaps the lower left on desktop and the sides crop
# on mobile, so everything that must survive sits centre-right and clear of
# the bottom-left corner.
banner = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500" width="1500" height="500">
  <rect width="1500" height="500" fill="{INK}"/>
  <g opacity="0.85">{ring(1308, 250, 118, 26)}</g>

  <text x="196" y="212" font-family="{SANS}" font-size="76" font-weight="700"
        letter-spacing="-3" fill="{PAPER}">Take a position. Keep it.</text>

  <text x="200" y="268" font-family="{SANS}" font-size="27" font-weight="400"
        fill="#9aa6b0">DreamDEX event contracts expire in a minute. Your position doesn't.</text>

  <text x="200" y="336" font-family="{MONO}" font-size="19" letter-spacing="1.3"
        fill="{MUTED}">ONE SIGNATURE  ·  ON-CHAIN VAULT  ·  SOMNIA SHANNON</text>
</svg>'''
pathlib.Path("x-banner.svg").write_text(banner)
print("wrote x-avatar.svg, x-banner.svg")
