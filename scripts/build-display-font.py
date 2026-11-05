"""Adds Spanish letters to Matcha World, which ships without them.

The free version of Matcha World (Khurasan, free for personal and commercial
use) has no accents, Ñ, ¿ or ¡. Instead of letting the browser borrow those
letters from another font, this script draws them from the font's own pieces:

  acute  = its grave accent, mirrored and shrunk
  tilde  = its ~ glyph, shrunk
  dots   = its period, shrunk (for Ü)
  ¿ ¡    = its ? and !, rotated 180 degrees
  ·      = its period, shrunk and raised
  – —    = its hyphen, stretched

The font is caps-only (lowercase shapes equal uppercase), so lowercase
accented letters reuse the same construction.

Usage: python3 scripts/build-display-font.py "Matcha World.ttf" src/fonts/matcha-world-es.ttf
"""
import sys

from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

src, dst = sys.argv[1], sys.argv[2]
font = TTFont(src)
glyf = font["glyf"]
hmtx = font["hmtx"]
cmap = font.getBestCmap()
glyph_set = font.getGlyphSet()

GAP = 48  # space between a capital and its accent


def name(ch):
    return cmap[ord(ch)]


def bounds(gname):
    g = glyf[gname]
    return g.xMin, g.yMin, g.xMax, g.yMax


def draw(pen, gname, scale_x=1.0, scale_y=1.0, dx=0.0, dy=0.0):
    """Draw glyph `gname` into `pen`, scaled then moved. Mirrored parts are reversed
    so every contour keeps the winding direction TrueType expects."""
    mirrored = (scale_x < 0) != (scale_y < 0)
    target = ReverseContourPen(pen) if mirrored else pen
    glyph_set[gname].draw(TransformPen(target, (scale_x, 0, 0, scale_y, dx, dy)))


def place_above(base, mark, scale_x, scale_y, mirror=False, lift=0):
    """Offsets that centre `mark` (after scaling) over `base`, just above its top."""
    bx0, _, bx1, by1 = bounds(base)
    mx0, my0, mx1, _ = bounds(mark)
    sx = -scale_x if mirror else scale_x
    # x of the scaled mark's left and right edges before translation
    left, right = sorted((mx0 * sx, mx1 * sx))
    dx = (bx0 + bx1) / 2 - (left + right) / 2
    dy = by1 + GAP + lift - my0 * scale_y
    return sx, dx, dy


def add(char, gname, build, advance):
    pen = TTGlyphPen(None)
    build(pen)
    glyph = pen.glyph()
    glyf[gname] = glyph
    glyph.recalcBounds(glyf)
    hmtx[gname] = (advance, glyph.xMin)
    if gname not in font.getGlyphOrder():
        font.setGlyphOrder(font.getGlyphOrder() + [gname])
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[ord(char)] = gname


def accented(char, base_char, mark_char, scale_x, scale_y, mirror=False, lift=0):
    base = name(base_char)
    mark = name(mark_char)
    sx, dx, dy = place_above(base, mark, scale_x, scale_y, mirror, lift)

    def build(pen):
        draw(pen, base)
        draw(pen, mark, sx, scale_y, dx, dy)

    add(char, f"uni{ord(char):04X}", build, hmtx[base][0])


def dieresis(char, base_char):
    base = name(base_char)
    dot = name(".")
    bx0, _, bx1, by1 = bounds(base)
    dx0, dy0, dx1, _ = bounds(dot)
    s = 0.5
    w = (dx1 - dx0) * s
    cx = (bx0 + bx1) / 2
    spread = w * 0.9

    def build(pen):
        draw(pen, base)
        for side in (-1, 1):
            draw(pen, dot, s, s, cx + side * spread - (dx0 * s + w / 2), by1 + GAP - dy0 * s)

    add(char, f"uni{ord(char):04X}", build, hmtx[base][0])


def rotated(char, src_char):
    g = name(src_char)
    x0, y0, x1, y1 = bounds(g)

    def build(pen):
        # 180° rotation inside the same box (determinant +1: no reversal needed)
        draw(pen, g, -1, -1, x0 + x1, y0 + y1)

    add(char, f"uni{ord(char):04X}", build, hmtx[g][0])


# Capitals and lowercase (same shapes in this font)
for up, low, base in (("Á", "á", "A"), ("É", "é", "E"), ("Í", "í", "I"), ("Ó", "ó", "O"), ("Ú", "ú", "U")):
    accented(up, base, "`", 0.5, 0.5, mirror=True)
    accented(low, base.lower(), "`", 0.5, 0.5, mirror=True)
accented("Ñ", "N", "~", 0.55, 0.5)
accented("ñ", "n", "~", 0.55, 0.5)
dieresis("Ü", "U")
dieresis("ü", "u")
rotated("¿", "?")
rotated("¡", "!")

# Middle dot
period = name(".")
px0, py0, px1, py1 = bounds(period)
add("·", "periodcentered",
    lambda pen: draw(pen, period, 0.75, 0.75, 0, 300 - py0 * 0.75),
    int(hmtx[period][0] * 0.8))

# Dashes from the hyphen
hyphen = name("-")
hx0, _, hx1, _ = bounds(hyphen)
for ch, gname, stretch in (("–", "endash", 1.6), ("—", "emdash", 2.6)):
    add(ch, gname,
        lambda pen, s=stretch: draw(pen, hyphen, s, 1, -hx0 * s + hx0),
        int(hmtx[hyphen][0] * stretch))

font["maxp"].numGlyphs = len(font.getGlyphOrder())
font.save(dst)
print(f"Wrote {dst} with {len(font.getBestCmap())} characters")
