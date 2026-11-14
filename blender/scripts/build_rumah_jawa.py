"""AUDIRA-LAND - generator rumah tradisional Jawa (joglo, limasan, kampung, panggang pe, tajug), low-poly hangat.

Jalankan (headless):
    D:\\Blender\\blender.exe -b --factory-startup --python blender/scripts/build_rumah_jawa.py

Hasil:
    blender/exports/rumah_joglo.glb, rumah_limasan.glb, preview_rumah_jawa.png
    blender/models/rumah_jawa.blend
    web/public/models/ (salinan .glb)

Konvensi: 1 unit = 1 m. Titik nol = dasar tengah, dasar tepat z=0 (zero-submerging).
Depan rumah menghadap -Y Blender = +Z three.js/glTF.
Satu material dengan warna vertex (COLOR_0) -> 1 draw call per rumah.
"""
import bpy, bmesh, os, shutil, json, struct
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EXPORTS = os.path.join(ROOT, "blender", "exports")
MODELS = os.path.join(ROOT, "blender", "models")
WEB_MODELS = os.path.join(ROOT, "web", "public", "models")
for d in (EXPORTS, MODELS, WEB_MODELS):
    os.makedirs(d, exist_ok=True)


def srgb_to_lin(h):
    def c(v):
        v /= 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (c(int(h[0:2], 16)), c(int(h[2:4], 16)), c(int(h[4:6], 16)), 1.0)


PAL_HEX = {
    "KAYU": "5B3A24", "KAYU_TUA": "3E2716", "GENTENG": "C8553D", "GENTENG_TUA": "93392A",
    "PLESTER": "FFF4E0", "BATU": "A09686", "BATU_TUA": "6E665C", "EMAS": "E9A91E",
    "GELAP": "2A1B12", "TEGEL": "D6B088",
}
PAL_KEYS = list(PAL_HEX)
PAL = {k: i for i, k in enumerate(PAL_KEYS)}


class Builder:
    def __init__(self):
        self.bm = bmesh.new()
        self.pal = self.bm.faces.layers.int.new("pal")

    def _tag(self, faces, col):
        for f in faces:
            f[self.pal] = PAL[col]

    def face(self, verts, col):
        f = self.bm.faces.new(verts)
        f[self.pal] = PAL[col]
        return f

    def obox(self, center, size, col, R=None):
        M = Matrix.Translation(Vector(center))
        if R is not None:
            M = M @ R.to_4x4()
        M = M @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        faces = {f for v in res["verts"] for f in v.link_faces}
        self._tag(faces, col)

    def box(self, x0, x1, y0, y1, z0, z1, col):
        """Kotak sejajar sumbu dari batas min/max."""
        self.obox(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2),
                  (x1 - x0, y1 - y0, z1 - z0), col)

    def beam(self, p0, p1, w, h, col):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        R = d.normalized().to_track_quat("X", "Z").to_matrix()
        self.obox((p0 + p1) / 2, (d.length, w, h), col, R)

    def frustum(self, cx, cy, z0, bhx, bhy, thx, thy, h, col, bottom=False):
        """Kotak meruncing (umpak, mustaka). Tanpa alas kecuali bottom=True."""
        B = [self.bm.verts.new((cx + x, cy + y, z0)) for x, y in
             ((-bhx, -bhy), (bhx, -bhy), (bhx, bhy), (-bhx, bhy))]
        T = [self.bm.verts.new((cx + x, cy + y, z0 + h)) for x, y in
             ((-thx, -thy), (thx, -thy), (thx, thy), (-thx, thy))]
        for i in range(4):
            j = (i + 1) % 4
            self.face([B[i], B[j], T[j], T[i]], col)
        self.face(T, col)
        if bottom:
            self.face(list(reversed(B)), col)

    def roof(self, b, t, n=6, lip=0.05, thick=0.12, cx=0.0, cy=0.0,
             top="GENTENG", lipc="GENTENG_TUA", under="KAYU", rim="KAYU_TUA",
             hip="GENTENG_TUA", ridge=True):
        """Satu tingkat atap perisai (hip). b/t = (setengah-x, setengah-y, z).
        Permukaan atas bergerigi per baris genteng (lip vertikal = garis bayangan)."""
        bx, by, bz = b
        tx, ty, tz = t
        lerp = lambda a, c, s: a + (c - a) * s

        def ring(s, dz=0.0):
            hx, hy, z = lerp(bx, tx, s), lerp(by, ty, s), lerp(bz, tz, s) + dz
            return [self.bm.verts.new((cx + x, cy + y, z)) for x, y in
                    ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]

        def band(L, U, col):
            for i in range(4):
                j = (i + 1) % 4
                self.face([L[i], L[j], U[j], U[i]], col)

        for k in range(n):
            s0, s1 = k / n, (k + 1) / n
            low, low_up, up = ring(s0), ring(s0, lip), ring(s1)
            band(low, low_up, lipc)
            band(low_up, up, top)
        # lisplang (papan tepi) + bidang bawah (kasau terlihat dari bawah)
        band(ring(0, -thick), ring(0), rim)
        Lb, Ub = ring(0, -thick), ring(1, -thick)
        for i in range(4):
            j = (i + 1) % 4
            self.face([Ub[i], Ub[j], Lb[j], Lb[i]], under)
        # bubungan jurai (hip) di 4 sudut
        corners = ((-1, -1), (1, -1), (1, 1), (-1, 1))
        for sx, sy in corners:
            p0 = (cx + sx * bx, cy + sy * by, bz + lip + 0.03)
            p1 = (cx + sx * tx, cy + sy * ty, tz + 0.03)
            self.beam(p0, p1, 0.16, 0.1, hip)
        if ridge and ty == 0.0:
            self.beam((cx - tx - 0.1, cy, tz + 0.05), (cx + tx + 0.1, cy, tz + 0.05), 0.24, 0.16, hip)
            for sx in (-1, 1):  # mustaka (puncak hias) di ujung bubungan
                x = cx + sx * (tx + 0.05)
                self.frustum(x, cy, tz + 0.12, 0.13, 0.13, 0.04, 0.04, 0.55, "EMAS")
                self.frustum(x, cy, tz + 0.67, 0.08, 0.08, 0.0, 0.0, 0.18, "EMAS")

    def column(self, x, y, z0, z1, sec, col="KAYU", umpak=True):
        """Tiang di atas umpak batu meruncing."""
        if umpak:
            self.frustum(x, y, z0, sec * 0.95, sec * 0.95, sec * 0.68, sec * 0.68, 0.24, "BATU_TUA")
            z0 += 0.24
        self.box(x - sec / 2, x + sec / 2, y - sec / 2, y + sec / 2, z0, z1, col)

    def ring_beam(self, hx, hy, z0, z1, w, col="KAYU_TUA", cx=0.0, cy=0.0):
        self.box(cx - hx - w / 2, cx + hx + w / 2, cy - hy - w / 2, cy - hy + w / 2, z0, z1, col)
        self.box(cx - hx - w / 2, cx + hx + w / 2, cy + hy - w / 2, cy + hy + w / 2, z0, z1, col)
        self.box(cx - hx - w / 2, cx - hx + w / 2, cy - hy + w / 2, cy + hy - w / 2, z0, z1, col)
        self.box(cx + hx - w / 2, cx + hx + w / 2, cy - hy + w / 2, cy + hy - w / 2, z0, z1, col)

    def window(self, x, y, z0, w, h, face=-1, axis="y"):
        """Jendela kayu: kusen + kaca gelap + 3 jeruji. face=-1 menonjol ke -sumbu."""
        t = 0.06 * face
        if axis == "y":
            self.box(x - w / 2 - 0.08, x + w / 2 + 0.08, min(y, y + t), max(y, y + t), z0 - 0.08, z0 + h + 0.08, "KAYU_TUA")
            self.box(x - w / 2, x + w / 2, min(y + t, y + t * 1.3), max(y + t, y + t * 1.3), z0, z0 + h, "GELAP")
            for k in (-1, 0, 1):
                xx = x + k * w / 4
                self.box(xx - 0.03, xx + 0.03, min(y + t, y + t * 1.8), max(y + t, y + t * 1.8), z0, z0 + h, "KAYU")
        else:
            self.box(min(x, x + t), max(x, x + t), y - w / 2 - 0.08, y + w / 2 + 0.08, z0 - 0.08, z0 + h + 0.08, "KAYU_TUA")
            self.box(min(x + t, x + t * 1.3), max(x + t, x + t * 1.3), y - w / 2, y + w / 2, z0, z0 + h, "GELAP")
            for k in (-1, 0, 1):
                yy = y + k * w / 4
                self.box(min(x + t, x + t * 1.8), max(x + t, x + t * 1.8), yy - 0.03, yy + 0.03, z0, z0 + h, "KAYU")

    def gebyok(self, x0, x1, y, z0, z1, door_w=1.7, door_h=2.25, carve=True):
        """Dinding kayu ukir (gebyok) menghadap -Y: panel, rangka, pintu kupu tarung, ukiran atas."""
        th = 0.12
        self.box(x0, x1, y, y + th, z0, z1, "KAYU")
        f = y - 0.05  # bidang depan rangka
        # rangka horizontal
        for za, zb in ((z0, z0 + 0.14), (z0 + 0.9, z0 + 1.0), (z1 - 0.62, z1 - 0.52), (z1 - 0.1, z1)):
            self.box(x0, x1, f, y, za, zb, "KAYU_TUA")
        # tiang rangka
        xs = [x0, x1, -door_w / 2 - 0.12, door_w / 2 + 0.12]
        span = (x1 - x0)
        if span > 5:
            xs += [x0 + (-door_w / 2 - 0.12 - x0) / 2, x1 - (x1 - door_w / 2 - 0.12) / 2]
        for xx in xs:
            self.box(xx - 0.08, xx + 0.08, f, y, z0, z1, "KAYU_TUA")
        # panel timbul (ukiran sederhana) di kiri-kanan pintu
        bays = sorted(set(round(v, 3) for v in xs))
        for a, c in zip(bays, bays[1:]):
            if a >= -door_w / 2 - 0.13 and c <= door_w / 2 + 0.13:
                continue
            for za, zb in ((z0 + 0.22, z0 + 0.82), (z0 + 1.1, z1 - 0.72)):
                self.box(a + 0.18, c - 0.18, f + 0.01, y, za, zb, "KAYU")
        # pintu kupu tarung (2 daun) + gagang emas
        hw = door_w / 2
        for sx in (-1, 1):
            xa, xb = (0.02, hw) if sx > 0 else (-hw, -0.02)
            self.box(xa, xb, y - 0.03, y, z0, z0 + door_h, "KAYU_TUA")
            self.box(xa + 0.12, xb - 0.12, y - 0.06, y - 0.03, z0 + 0.25, z0 + door_h * 0.45, "KAYU")
            self.box(xa + 0.12, xb - 0.12, y - 0.06, y - 0.03, z0 + door_h * 0.52, z0 + door_h - 0.2, "KAYU")
            self.box(sx * 0.1 - 0.03, sx * 0.1 + 0.03, y - 0.1, y - 0.03, z0 + 1.0, z0 + 1.2, "EMAS")
        self.box(-hw - 0.1, hw + 0.1, y - 0.08, y, z0 + door_h, z0 + door_h + 0.16, "KAYU_TUA")
        if carve:
            # pita ukiran: belah ketupat emas di bidang atas
            n = max(4, int((x1 - x0) / 0.55))
            zc = z1 - 0.31
            R = Matrix.Rotation(0.7854, 3, "Y")
            for k in range(n):
                xx = x0 + (k + 0.5) * (x1 - x0) / n
                self.obox((xx, f - 0.01, zc), (0.22, 0.05, 0.22), "EMAS", R)

    def slope(self, x0, x1, yl, zl, yh, zh, n=5, lip=0.05, thick=0.12, top="GENTENG",
              lipc="GENTENG_TUA", under="KAYU", rim="KAYU_TUA", close_high=False, verge=True):
        """Satu bidang atap miring (pelana / sandar). Tepi bawah di yl (z=zl), tepi atas di yh."""
        lerp = lambda a, c, s: a + (c - a) * s
        up_pos = yh > yl

        def edge(s, dz=0.0):
            y, z = lerp(yl, yh, s), lerp(zl, zh, s) + dz
            return [self.bm.verts.new((x0, y, z)), self.bm.verts.new((x1, y, z))]

        def q(A, B, col, flip=False):
            vs = [A[0], A[1], B[1], B[0]] if up_pos else [A[1], A[0], B[0], B[1]]
            self.face(list(reversed(vs)) if flip else vs, col)

        for k in range(n):
            s0, s1 = k / n, (k + 1) / n
            low, low_up, hi = edge(s0), edge(s0, lip), edge(s1)
            q(low, low_up, lipc)
            q(low_up, hi, top)
        q(edge(0, -thick), edge(0), rim)
        q(edge(0, -thick), edge(1, -thick), under, flip=True)
        if close_high:
            q(edge(1, -thick), edge(1), rim, flip=True)
        if verge:  # papan lisplang miring di kedua ujung
            for x in (x0, x1):
                self.beam((x, yl, zl - thick / 2 + 0.03), (x, yh, zh - thick / 2 + 0.03), 0.1, thick + 0.12, rim)

    def prism_x(self, x, th, pts, col):
        """Dinding poligon tegak di bidang YZ (mis. tebeng segitiga). pts = [(y,z),...] CCW dilihat dari +X."""
        A = [self.bm.verts.new((x + th / 2, y, z)) for y, z in pts]
        Bv = [self.bm.verts.new((x - th / 2, y, z)) for y, z in pts]
        self.face(A, col)
        self.face(list(reversed(Bv)), col)

    def cyl(self, center, r, depth, col, axis="Z", segs=8):
        R = {"Z": Matrix.Identity(3), "X": Matrix.Rotation(1.5708, 3, "Y"),
             "Y": Matrix.Rotation(1.5708, 3, "X")}[axis]
        M = Matrix.Translation(Vector(center)) @ R.to_4x4()
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                    radius1=r, radius2=r, depth=depth, matrix=M)
        self._tag({f for v in res["verts"] for f in v.link_faces}, col)

    def mustaka(self, x, y, z, s=1.0):
        self.frustum(x, y, z, 0.13 * s, 0.13 * s, 0.04 * s, 0.04 * s, 0.55 * s, "EMAS")
        self.frustum(x, y, z + 0.55 * s, 0.08 * s, 0.08 * s, 0.0, 0.0, 0.18 * s, "EMAS")

    def lincak(self, x, y, w=1.8, d=0.6, F=0.0, axis="x"):
        hw, hd = (w / 2, d / 2) if axis == "x" else (d / 2, w / 2)
        self.box(x - hw, x + hw, y - hd, y + hd, F + 0.42, F + 0.5, "KAYU")
        for dx in (-hw + 0.08, hw - 0.08):
            for dy in (-hd + 0.08, hd - 0.08):
                self.box(x + dx - 0.04, x + dx + 0.04, y + dy - 0.04, y + dy + 0.04, F, F + 0.42, "KAYU_TUA")

    def finish(self, name):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER")
        lin = [srgb_to_lin(PAL_HEX[k]) for k in PAL_KEYS]
        pal_attr = me.attributes["pal"].data
        for p in me.polygons:
            c = lin[pal_attr[p.index].value]
            for li in p.loop_indices:
                attr.data[li].color = c
        me.attributes.remove(me.attributes["pal"])
        for p in me.polygons:
            p.use_smooth = False
        me.materials.append(vc_material())
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


_MAT = None


def vc_material():
    global _MAT
    if _MAT:
        return _MAT
    m = bpy.data.materials.new("RumahJawa_VC")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    vc = nt.nodes.new("ShaderNodeVertexColor")
    vc.layer_name = "Col"
    nt.links.new(vc.outputs[0], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0
    _MAT = m
    return m


# ---------------------------------------------------------------- JOGLO (16x16 m)
def build_joglo():
    B = Builder()
    F = 0.45  # tinggi lantai (bebatur)
    # bebatur batu + lantai tegel + undakan depan
    B.box(-7.0, 7.0, -6.0, 6.0, 0.0, F - 0.03, "BATU")
    B.box(-6.85, 6.85, -5.85, 5.85, F - 0.03, F, "TEGEL")
    B.box(-2.2, 2.2, -7.1, -6.0, 0.0, 0.15, "BATU")
    B.box(-2.2, 2.2, -6.65, -6.0, 0.15, 0.30, "BATU")

    # soko guru (4) + tumpang sari bertingkat
    for x in (-2.2, 2.2):
        for y in (-1.6, 1.6):
            B.column(x, y, F, 4.75, 0.32, "KAYU")
    for k, (z0, z1) in enumerate(((4.6, 4.75), (4.75, 4.9), (4.9, 5.05), (5.05, 5.2))):
        B.ring_beam(2.2 + 0.18 * k, 1.6 + 0.18 * k, z0, z1, 0.2, "KAYU_TUA" if k % 2 == 0 else "KAYU")
    # sunduk-kili (balok silang) di antara soko guru
    B.box(-2.2, 2.2, -0.06, 0.06, 4.2, 4.38, "KAYU_TUA")

    # soko pengarak (12) + blandar
    ring2 = [(x, y) for x in (-4.9, -2.2, 2.2, 4.9) for y in (-3.9, 3.9)] + \
            [(x, y) for x in (-4.9, 4.9) for y in (-1.6, 1.6)]
    for x, y in ring2:
        B.column(x, y, F, 3.9, 0.24)
    B.ring_beam(4.9, 3.9, 3.7, 3.92, 0.2)

    # soko emper (16) + blandar emper
    ring3 = [(x, y) for x in (-6.7, -4.9, -2.2, 2.2, 4.9, 6.7) for y in (-5.7, 5.7)] + \
            [(x, y) for x in (-6.7, 6.7) for y in (-1.6, 1.6)]
    for x, y in ring3:
        B.column(x, y, F, 3.0, 0.18)
    B.ring_beam(6.7, 5.7, 2.84, 3.04, 0.16)

    # dalem (ruang tertutup belakang): gebyok depan, dinding plester + jendela
    yW = 2.0
    B.gebyok(-3.4, 3.4, yW, F, 3.0)
    for sx in (-1, 1):
        xa, xb = (3.4, 6.7) if sx > 0 else (-6.7, -3.4)
        B.box(xa, xb, yW, yW + 0.15, F, 2.84, "PLESTER")
        B.box(xa, xb, yW - 0.03, yW + 0.15, F, F + 0.3, "BATU_TUA")  # plint
        B.window((xa + xb) / 2, yW, F + 1.05, 1.2, 1.1, face=-1)
        # dinding samping
        x = sx * 6.7
        B.box(min(x, x - sx * 0.15), max(x, x - sx * 0.15), yW, 5.7, F, 2.84, "PLESTER")
        B.window(x, 3.85, F + 1.05, 1.1, 1.1, face=sx, axis="x")
    B.box(-6.7, 6.7, 5.55, 5.7, F, 2.84, "PLESTER")

    # atap tiga tingkat: emper -> penanggap -> brunjung (bubungan pendek)
    B.roof((7.5, 6.5, 3.05), (5.0, 4.0, 3.72), n=4, thick=0.14)
    B.ring_beam(5.0, 4.0, 3.68, 3.98, 0.12, "KAYU_TUA")  # tritisan antar-tingkat (garis gelap)
    B.roof((5.4, 4.4, 4.0), (3.2, 2.3, 5.35), n=5, thick=0.2)
    B.roof((3.45, 2.55, 5.25), (1.3, 0.0, 8.3), n=7, thick=0.18)

    # perabot pendopo: 2 lincak (bangku bambu) + gentong
    for sx in (-1, 1):
        x = sx * 3.6
        B.box(x - 0.9, x + 0.9, -3.2, -2.6, F + 0.42, F + 0.5, "KAYU")
        for dx in (-0.8, 0.8):
            for dy in (-3.12, -2.68):
                B.box(x + dx - 0.04, x + dx + 0.04, dy - 0.04, dy + 0.04, F, F + 0.42, "KAYU_TUA")
    B.frustum(6.2, -5.0, F, 0.22, 0.22, 0.3, 0.3, 0.55, "GENTENG_TUA")
    return B.finish("rumah_joglo")


# ---------------------------------------------------------------- LIMASAN (8x8 m)
def build_limasan():
    B = Builder()
    F = 0.35
    B.box(-3.5, 3.5, -3.3, 3.3, 0.0, F - 0.03, "BATU")
    B.box(-3.4, 3.4, -3.2, 3.2, F - 0.03, F, "TEGEL")
    B.box(-1.1, 1.1, -3.75, -3.3, 0.0, 0.17, "BATU")

    # tiang emper (6) di atas umpak + blandar emper
    for x in (-3.15, -1.05, 1.05, 3.15):
        B.column(x, -3.0, F, 2.7, 0.18)
    for x in (-3.15, 3.15):
        B.column(x, 2.95, F, 2.7, 0.18)
    B.ring_beam(3.15, 2.975, 2.55, 2.74, 0.15)

    # badan rumah
    y0, y1, x0, x1, zt = -1.4, 2.7, -2.8, 2.8, 2.6
    B.gebyok(x0, x1, y0, F, zt, door_w=1.5, door_h=2.05)
    for sx in (-1, 1):
        x = sx * 2.8
        B.box(min(x, x - sx * 0.14), max(x, x - sx * 0.14), y0 + 0.12, y1, F, zt, "PLESTER")
        B.box(min(x + sx * 0.03, x - sx * 0.14), max(x + sx * 0.03, x - sx * 0.14), y0 + 0.12, y1, F, F + 0.28, "BATU_TUA")
        B.window(x, 0.8, F + 0.95, 1.0, 1.0, face=sx, axis="x")
        B.box(x - 0.09, x + 0.09, y1 - 0.09, y1 + 0.09, F, zt, "KAYU_TUA")  # tiang sudut
    B.box(x0, x1, y1 - 0.14, y1, F, zt, "PLESTER")
    B.window(0.0, y1, F + 0.95, 1.1, 1.0, face=1)
    # soko guru (4) menembus plafon -> blandar penopang atap utama (terlihat dari teras)
    for x in (-1.6, 1.6):
        for y in (-0.3, 1.6):
            B.column(x, y, F, 3.05, 0.24, umpak=True)
    B.ring_beam(1.6, 0.95, 2.86, 3.05, 0.18, cy=0.65)

    # atap: emper keliling + atap utama limasan (bubungan panjang)
    B.roof((3.88, 3.78, 2.45), (3.05, 2.6, 2.95), n=3, thick=0.12)
    B.roof((3.2, 2.85, 2.86), (1.65, 0.0, 5.05), n=6, thick=0.14, cy=0.0)

    # amben (bale-bale) di teras + kendi
    B.box(-2.7, -1.5, -2.75, -1.75, F + 0.4, F + 0.48, "KAYU")
    for dx in (-2.62, -1.58):
        for dy in (-2.67, -1.83):
            B.box(dx - 0.04, dx + 0.04, dy - 0.04, dy + 0.04, F, F + 0.4, "KAYU_TUA")
    B.frustum(2.2, -2.3, F, 0.16, 0.16, 0.22, 0.22, 0.4, "GENTENG_TUA")
    return B.finish("rumah_limasan")


# ---------------------------------------------------------------- RUMAH KAMPUNG (8x8 m)
def build_kampung():
    """Atap pelana (dua bidang) + emper sandar di depan, tebeng kayu di sisi."""
    B = Builder()
    F = 0.35
    B.box(-3.4, 3.4, -3.5, 3.1, 0.0, F - 0.03, "BATU")
    B.box(-3.3, 3.3, -3.4, 3.0, F - 0.03, F, "TEGEL")
    B.box(-1.0, 1.0, -3.9, -3.5, 0.0, 0.17, "BATU")

    x0, x1, y0, y1, zt = -2.8, 2.8, -1.6, 2.6, 2.65
    B.gebyok(x0, x1, y0, F, zt, door_w=1.4, door_h=2.0, carve=False)
    for sx in (-1, 1):
        x = sx * 2.8
        B.box(min(x, x - sx * 0.14), max(x, x - sx * 0.14), y0 + 0.12, y1, F, zt, "PLESTER")
        B.box(min(x + sx * 0.03, x - sx * 0.14), max(x + sx * 0.03, x - sx * 0.14), y0 + 0.12, y1, F, F + 0.28, "BATU_TUA")
        B.window(x, 0.6, F + 0.95, 1.0, 1.0, face=sx, axis="x")
        for y in (y0 + 0.05, y1 - 0.05):
            B.box(x - 0.09, x + 0.09, y - 0.09, y + 0.09, F, zt, "KAYU_TUA")
    B.box(x0, x1, y1 - 0.14, y1, F, zt, "PLESTER")
    B.window(0.0, y1, F + 0.95, 1.1, 1.0, face=1)
    B.ring_beam(2.8, 2.1, zt - 0.05, zt + 0.12, 0.16, cy=0.5)

    # atap pelana: bubungan sejajar X di y=0.5
    yr, zr, ze, th = 0.5, 4.7, 2.75, 0.12
    yf, yb = -2.25, 3.3
    B.slope(-3.5, 3.5, yf, ze, yr, zr, n=6, thick=th)
    B.slope(-3.5, 3.5, yb, ze, yr, zr, n=6, thick=th)
    B.beam((-3.6, yr, zr + 0.05), (3.6, yr, zr + 0.05), 0.26, 0.16, "GENTENG_TUA")
    for sx in (-1, 1):
        B.mustaka(sx * 3.5, yr, zr + 0.12, 0.7)
    zf = lambda y, yl: ze + (y - yl) / (yr - yl) * (zr - ze) - th - 0.03
    for sx in (-1, 1):  # tebeng kayu (dinding segitiga) di bawah atap
        B.prism_x(sx * 2.8, 0.1, [(y0, zt), (y1, zt), (y1, zf(y1, yb)), (yr, zr - th - 0.03), (y0, zf(y0, yf))], "KAYU")
        B.box(sx * 2.8 - 0.06, sx * 2.8 + 0.06, yr - 0.5, yr + 0.5, zt + 0.55, zt + 0.95, "GELAP")  # lubang angin

    # emper depan (atap sandar) + tiang teras di atas umpak
    B.slope(-3.4, 3.4, -3.85, 2.35, -1.9, 2.78, n=3, thick=0.1)
    for x in (-3.15, -1.05, 1.05, 3.15):
        B.column(x, -3.5, F, 2.3, 0.16)
    B.box(-3.25, 3.25, -3.58, -3.42, 2.14, 2.3, "KAYU_TUA")

    B.lincak(-1.95, -2.6, F=F)
    B.frustum(2.1, -2.5, F, 0.16, 0.16, 0.22, 0.22, 0.4, "GENTENG_TUA")
    B.frustum(2.6, -2.9, F, 0.2, 0.2, 0.26, 0.26, 0.32, "GENTENG")   # pot tanaman
    B.frustum(2.6, -2.9, F + 0.32, 0.22, 0.22, 0.05, 0.05, 0.5, "KAYU")
    return B.finish("rumah_kampung")


# ---------------------------------------------------------------- PANGGANG PE / WARUNG (8x8 m)
def build_panggangpe():
    """Atap sandar satu bidang (panggang pe), dipakai sebagai warung."""
    B = Builder()
    F = 0.3
    B.box(-3.4, 3.4, -3.3, 3.0, 0.0, F - 0.03, "BATU")
    B.box(-3.3, 3.3, -3.2, 2.9, F - 0.03, F, "TEGEL")

    yl, zl, yh, zh, th = -3.85, 2.6, 3.0, 4.15, 0.12
    zroof = lambda y: zl + (y - yl) / (yh - yl) * (zh - zl) - th - 0.03
    B.slope(-3.6, 3.6, yl, zl, yh, zh, n=7, thick=th, close_high=True)

    # dinding belakang + sayap samping (plester), mengikuti kemiringan atap
    B.box(-3.2, 3.2, 2.5, 2.65, F, zroof(2.65), "PLESTER")
    B.box(-3.2, 3.2, 2.47, 2.65, F, F + 0.3, "BATU_TUA")
    for sx in (-1, 1):
        B.prism_x(sx * 3.13, 0.14, [(0.4, F), (2.5, F), (2.5, zroof(2.5)), (0.4, zroof(0.4))], "PLESTER")
        B.window(sx * 3.2, 1.45, F + 1.0, 0.9, 0.9, face=sx, axis="x")
    # tiang depan + tengah, balok
    for x in (-3.25, -1.1, 1.1, 3.25):
        B.column(x, -3.45, F, zroof(-3.45), 0.16)
    B.box(-3.35, 3.35, -3.53, -3.37, zroof(-3.45) - 0.16, zroof(-3.45), "KAYU_TUA")
    for sx in (-1, 1):
        B.column(sx * 3.25, 0.3, F, zroof(0.3), 0.16)

    # papan nama warung (bingkai emas)
    B.box(-1.3, 1.3, -3.56, -3.5, 2.0, 2.33, "KAYU_TUA")
    B.box(-1.36, 1.36, -3.6, -3.56, 1.96, 2.0, "EMAS")
    B.box(-1.36, 1.36, -3.6, -3.56, 2.33, 2.37, "EMAS")
    for k in range(5):
        xx = -0.9 + k * 0.45
        B.box(xx - 0.12, xx + 0.12, -3.6, -3.56, 2.1, 2.23, "PLESTER")

    # meja warung + toples dagangan
    B.box(-2.4, 2.4, -1.25, -0.7, F, F + 0.95, "KAYU")
    B.box(-2.5, 2.5, -1.35, -0.6, F + 0.95, F + 1.02, "KAYU_TUA")
    for k in range(6):
        xx = -2.0 + k * 0.8
        B.box(xx - 0.06, xx + 0.06, -1.29, -1.25, F + 0.1, F + 0.9, "KAYU_TUA")
    cols = ["EMAS", "GENTENG", "PLESTER", "TEGEL", "GENTENG_TUA", "EMAS"]
    for k, c in enumerate(cols):
        xx = -2.0 + k * 0.8
        B.cyl((xx, -0.95, F + 1.15), 0.13, 0.26, c, segs=6)
    # rak belakang 3 susun + barang
    for z in (1.0, 1.6, 2.2):
        B.box(-2.6, 2.6, 2.1, 2.5, F + z, F + z + 0.05, "KAYU")
        for k in range(7):
            xx = -2.3 + k * 0.76
            B.box(xx - 0.14, xx + 0.14, 2.18, 2.42, F + z + 0.05, F + z + 0.33, cols[(k + int(z * 10)) % len(cols)])
    # lincak pembeli + gentong air
    B.lincak(-1.3, -2.3, w=1.6, d=0.45, F=F)
    B.lincak(1.3, -2.3, w=1.6, d=0.45, F=F)
    B.frustum(2.9, -2.7, F, 0.2, 0.2, 0.27, 0.27, 0.6, "GENTENG_TUA")
    return B.finish("rumah_panggangpe")


# ---------------------------------------------------------------- TAJUG / LANGGAR (8x8 m)
def build_tajug():
    """Atap piramida tiga tingkat (tajug lawakan), dipakai sebagai langgar."""
    B = Builder()
    F = 0.45
    B.box(-3.3, 3.3, -3.3, 3.3, 0.0, F - 0.03, "BATU")
    B.box(-3.2, 3.2, -3.2, 3.2, F - 0.03, F, "TEGEL")
    B.box(-1.1, 1.1, -3.95, -3.3, 0.0, 0.15, "BATU")
    B.box(-1.1, 1.1, -3.65, -3.3, 0.15, 0.30, "BATU")

    y0, y1, h, zt = -1.6, 2.3, 2.3, 3.1
    B.gebyok(-h, h, y0, F, zt, door_w=1.3, door_h=2.1)
    for sx in (-1, 1):
        x = sx * h
        B.box(min(x, x - sx * 0.14), max(x, x - sx * 0.14), y0 + 0.12, y1, F, zt, "PLESTER")
        B.box(min(x + sx * 0.03, x - sx * 0.14), max(x + sx * 0.03, x - sx * 0.14), y0 + 0.12, y1, F, F + 0.28, "BATU_TUA")
        B.window(x, 0.35, F + 0.9, 0.8, 1.2, face=sx, axis="x")
        for y in (y0 + 0.05, y1 - 0.05):
            B.box(x - 0.1, x + 0.1, y - 0.1, y + 0.1, F, 3.35, "KAYU_TUA")
    B.box(-h, h, y1 - 0.14, y1, F, zt, "PLESTER")
    B.ring_beam(h, (y1 - y0) / 2, zt, 3.35, 0.18, cy=(y0 + y1) / 2)
    # mihrab menonjol di belakang + atap kecil
    B.box(-0.75, 0.75, y1, 2.95, F, 2.3, "PLESTER")
    B.roof((0.98, 0.5, 2.25), (0.0, 0.0, 2.95), n=2, thick=0.08, cy=2.65, ridge=False)

    # tiang emper teras + blandar
    for x in (-3.05, -1.0, 1.0, 3.05):
        B.column(x, -3.05, F, 2.75, 0.16)
    for x in (-3.05, 3.05):
        B.column(x, 3.05, F, 2.75, 0.16)
    B.ring_beam(3.05, 3.05, 2.6, 2.78, 0.14)

    # atap tajug tiga tingkat + mustaka besar di puncak
    B.roof((3.85, 3.85, 2.55), (2.5, 2.5, 3.2), n=3, thick=0.12)
    B.roof((2.75, 2.75, 3.4), (1.45, 1.45, 4.45), n=4, thick=0.14)
    B.roof((1.65, 1.65, 4.35), (0.0, 0.0, 6.3), n=6, thick=0.14, ridge=False)
    B.frustum(0, 0, 6.2, 0.22, 0.22, 0.12, 0.12, 0.35, "EMAS")
    B.frustum(0, 0, 6.55, 0.12, 0.12, 0.0, 0.0, 0.6, "EMAS")

    # bedug di atas jagrag + kentongan + padasan (gentong wudu)
    B.cyl((-2.3, -2.55, F + 0.95), 0.42, 0.85, "GENTENG_TUA", axis="X", segs=10)
    for dx in (-0.5, 0.5):
        B.box(-2.3 + dx - 0.05, -2.3 + dx + 0.05, -2.6, -2.5, F, F + 0.95, "KAYU_TUA")
    B.box(-2.85, -1.75, -2.6, -2.5, F + 0.5, F + 0.58, "KAYU_TUA")
    B.cyl((2.75, -3.05, 1.75), 0.1, 0.9, "KAYU", segs=6)
    B.frustum(2.5, -2.3, F, 0.2, 0.2, 0.26, 0.26, 0.55, "GENTENG")
    return B.finish("rumah_tajug")


# ---------------------------------------------------------------- main
def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for me in list(bpy.data.meshes):
        bpy.data.meshes.remove(me)


def export_glb(ob, path):
    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_yup=True,
              export_apply=True, export_animations=False, export_cameras=False,
              export_lights=False, export_normals=True, export_materials="EXPORT",
              export_vertex_color="ACTIVE", export_all_vertex_colors=False)
    kw = {k: v for k, v in kw.items() if k in props}
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(**kw)


def glb_info(path):
    with open(path, "rb") as f:
        data = f.read()
    ln = struct.unpack_from("<I", data, 12)[0]
    js = json.loads(data[20:20 + ln])
    prim = js["meshes"][0]["primitives"]
    tris = sum(js["accessors"][p["indices"]]["count"] // 3 for p in prim)
    attrs = sorted(prim[0]["attributes"].keys())
    pos = js["accessors"][prim[0]["attributes"]["POSITION"]]
    return dict(tris=tris, primitives=len(prim), materials=len(js.get("materials", [])),
                attributes=attrs, min=pos["min"], max=pos["max"], bytes=len(data))


def setup_render():
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            continue
    try:
        sc.view_settings.view_transform = "Standard"
    except TypeError:
        pass
    sc.render.resolution_x, sc.render.resolution_y = 1600, 900
    gm = bpy.data.meshes.new("tanah")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=40)
    bm.to_mesh(gm)
    bm.free()
    g = bpy.data.objects.new("tanah", gm)
    sc.collection.objects.link(g)
    gmat = bpy.data.materials.new("tanah")
    gmat.use_nodes = True
    b = next(n for n in gmat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = srgb_to_lin("A7B57A")
    b.inputs["Roughness"].default_value = 1.0
    gm.materials.append(gmat)
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = srgb_to_lin("CFE3F2")
    bg.inputs[1].default_value = 0.9
    sun_d = bpy.data.lights.new("matahari", "SUN")
    sun_d.energy = 3.6
    sun_d.angle = 0.06
    sun = bpy.data.objects.new("matahari", sun_d)
    sun.rotation_euler = (0.85, 0.15, -0.65)
    sc.collection.objects.link(sun)
    tgt = bpy.data.objects.new("target_kamera", None)
    sc.collection.objects.link(tgt)
    cd = bpy.data.cameras.new("kamera")
    cd.lens = 28
    cam = bpy.data.objects.new("kamera", cd)
    sc.collection.objects.link(cam)
    c = cam.constraints.new("TRACK_TO")
    c.target = tgt
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"
    sc.camera = cam


def render_shot(objs, layout, cam_loc, tgt_loc, filename):
    for name, ob in objs.items():
        ob.hide_render = name not in layout
        if name in layout:
            ob.location = (layout[name], 0.0, 0.0)
    bpy.data.objects["kamera"].location = cam_loc
    bpy.data.objects["target_kamera"].location = tgt_loc
    sc = bpy.context.scene
    sc.render.filepath = os.path.join(EXPORTS, filename)
    bpy.ops.render.render(write_still=True)


def main():
    reset_scene()
    builders = (build_joglo, build_limasan, build_kampung, build_panggangpe, build_tajug)
    objs, report = {}, {}
    for fn in builders:
        ob = fn()
        objs[ob.name] = ob
        ob.location = (0, 0, 0)
        p = os.path.join(EXPORTS, ob.name + ".glb")
        export_glb(ob, p)
        shutil.copy2(p, os.path.join(WEB_MODELS, ob.name + ".glb"))
        info = glb_info(p)
        info["min_z"] = round(min(v.co.z for v in ob.data.vertices), 5)
        report[ob.name] = info
    setup_render()
    render_shot(objs, {"rumah_joglo": -9.0, "rumah_limasan": 7.5},
                (8.0, -23.0, 6.0), (-1.0, 0.0, 2.9), "preview_rumah_jawa.png")
    render_shot(objs, {"rumah_kampung": -9.5, "rumah_panggangpe": 0.0, "rumah_tajug": 9.5},
                (5.0, -24.0, 7.0), (0.5, 0.0, 2.3), "preview_rumah_jawa_2.png")
    # tata letak .blend: kelima rumah berjajar, titik nol masing-masing tetap di dasar tengah
    for ob, x in zip(objs.values(), (-22.0, -6.0, 5.0, 15.0, 25.0)):
        ob.location = (x, 0.0, 0.0)
        ob.hide_render = False
    report["render_engine"] = bpy.context.scene.render.engine
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(MODELS, "rumah_jawa.blend"))
    with open(os.path.join(EXPORTS, "rumah_jawa_report.json"), "w") as f:
        json.dump(report, f, indent=1)
    short = {k: (v["tris"], [round(a, 2) for a in v["min"]], [round(a, 2) for a in v["max"]], v["attributes"])
             for k, v in report.items() if isinstance(v, dict)}
    print("AUDIRA_REPORT " + json.dumps(short))


main()
