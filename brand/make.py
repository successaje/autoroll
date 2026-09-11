import math, pathlib

BLUE, ORANGE = "#3987e5", "#d95926"
INK, MUTED, BG = "#f4f4f2", "#6e6f76", "#0b0c0f"

S, C, R, W = 256, 128, 84, 19
N       = 10          # windows in one turn of the ring
DOWN_I  = 2           # one window taken on the Down side — kept near the
                      # leading edge so it reads orange rather than muddy brown
FILL    = 0.62        # of each period that is bar rather than gap
FADE_TO = 0.26        # trailing opacity — the roll fading out behind itself

def seg(i):
    """One window. Opacity falls off behind the leading edge, so the ring reads
       as motion rather than as a static dial."""
    step = 360 / N
    span = step * FILL
    a1 = -90 + i * step + (step - span) / 2
    a2 = a1 + span
    r1, r2 = math.radians(a1), math.radians(a2)
    x1, y1 = C + R * math.cos(r1), C + R * math.sin(r1)
    x2, y2 = C + R * math.cos(r2), C + R * math.sin(r2)
    op = 1 - (1 - FADE_TO) * (i / (N - 1))
    col = ORANGE if i == DOWN_I else BLUE
    return (f'<path d="M {x1:.2f} {y1:.2f} A {R} {R} 0 0 1 {x2:.2f} {y2:.2f}" '
            f'fill="none" stroke="{col}" stroke-width="{W}" stroke-linecap="round" '
            f'opacity="{op:.3f}"/>')

def ring():
    return "\n  ".join(seg(i) for i in range(N))

def mark(bg=None, pad=0):
    box = S + pad * 2
    back = f'<rect width="{box}" height="{box}" rx="{box*0.22:.0f}" fill="{bg}"/>' if bg else ""
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box} {box}" width="{box}" height="{box}">
  {back}
  <g transform="translate({pad} {pad})">
  {ring()}
  </g>
</svg>'''

def wordmark(bg=None):
    w, h = 1060, 340   # trimmed so the right margin matches the left
    back = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    size = 216
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">
  {back}
  <g transform="translate(120 {(h-size)/2}) scale({size/S:.4f})">
  {ring()}
  </g>
  <text x="400" y="168" font-family="Inter, ui-sans-serif, -apple-system, Segoe UI, system-ui, sans-serif"
        font-size="100" font-weight="700" letter-spacing="-3.5" fill="{INK}">AutoRoll</text>
  <text x="406" y="222" font-family="ui-monospace, SF Mono, JetBrains Mono, Menlo, monospace"
        font-size="31" letter-spacing="1.5" fill="{MUTED}">perpetual event contracts</text>
</svg>'''

pathlib.Path("logo-mark.svg").write_text(mark())
pathlib.Path("logo-mark-dark.svg").write_text(mark(bg=BG, pad=30))
pathlib.Path("logo-wordmark.svg").write_text(wordmark())
pathlib.Path("logo-wordmark-dark.svg").write_text(wordmark(bg=BG))
print("ok")
