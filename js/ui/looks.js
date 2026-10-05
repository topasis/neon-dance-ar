// Looks: lists of items (shapes and freehand strokes) placed on the model pose, drawn onto a person through the
// bone matrices of js/logic/rig.js (add-look-editor design §4-§7). No DOM access; works on any 2D context.
//
// Data (model space, see design §4)
//   Item  { id, type, x, y, scale, rotation, color, points? }   type in ITEM_TYPES; color '#RRGGBB' or null (person
//         colour); points [{ x, y }] for 'stroke' only. Fields starting with '_' are caches (anchors), never saved.
//   Look  { name, items: [Item] }
//
// API
//   ITEM_TYPES, SHAPE_TYPES          all item types / the non-stroke ones
//   BASE_RADIUS                      ~half the base size of a shape at scale 1 (model units), for hit-testing
//   tracePath(ctx, item)             adds the item's subpaths in item space: shapes centred on (0, 0) at base size,
//                                    a stroke as its raw model-space polyline. No beginPath, no stroke.
//   Anchors: each anchor point (a shape's centre, or each stroke point) has an ordered list of candidate bone names
//   (rig.anchorCandidates); it is drawn through the first one whose matrix is usable. Points on a keypoint have
//   several candidates (every bone ending there maps the point exactly); stroke points prefer a bone shared with a
//   neighbouring point, so e.g. a shoulder->elbow line uses L_UPPER at both ends.
//   bindItem(item) -> item           computes and caches the anchors (in '_' fields). Call after every edit of a
//                                    stroke's points. Drawing rebinds by itself when the cache is missing, when a
//                                    shape's x/y changed, or when a stroke's point count changed, but not when stroke
//                                    points were moved in place.
//   anchorBones(item) -> [[bone]]    the candidate lists, one per anchor point (shapes: one list; strokes: one per
//                                    point), binding first if needed. Read-only; use this instead of the caches.
//   bindLook(look) -> look
//   traceItem(ctx, item, matrixFor) -> bool
//                                    adds the item's path mapped through its bone(s); false if nothing was added
//                                    (bone not usable, unknown type). The current ctx transform still applies on top.
//   drawItem(ctx, item, matrixFor, color, style)
//   drawLook(ctx, look, matrixFor, color, style)
//                                    stroke items in `item.color ?? color`. Consecutive items of the same colour share
//                                    one stroke() call. Sets strokeStyle/lineWidth/lineCap/lineJoin and leaves them
//                                    set (wrap in save/restore). Items whose bone isn't usable are skipped.
//       matrixFor(boneName) -> [a, b, c, d, e, f] | null   (Rig#matrixFor live, identityMatrixFor in the editor)
//       style = { lineWidth, glow }  the render pass's style (renderer.glowStyle / crispStyle). lineWidth is used as
//                                    is for every item: it is applied after the item transform is restored, so it is
//                                    in the pass's pixels and isn't scaled by the bone or item scale (same as the old
//                                    skeleton). `glow` isn't used yet; reserved for item types that must skip the
//                                    glow pass (Phase 3 images).
//   createItem(type, fields) -> item new item with a fresh id, defaults filled in, anchors bound
//   copyLook(look) -> look           deep copy without caches (load a preset into a slot without changing it)
//   sanitizeLook(value) -> look|null validates untrusted data (storage); drops invalid items, null if not a look
//   PRESETS                          { classic, glowSticks, party, elSuit }; PRESETS.classic is the default look.
//                                    Treat as read-only (only the anchor caches get written); copyLook before editing.
import { CONFIG } from '../config.js';
import { BONES, MODEL_POINTS, anchorCandidates } from '../logic/rig.js';

const TAU = 2 * Math.PI;

// Base shapes, centred on (0, 0), roughly 40 model units across. Every subpath starts with moveTo/rect so items
// traced into the same path aren't joined.
const SHAPES = {
    circle(ctx) {
        ctx.moveTo(20, 0);
        ctx.arc(0, 0, 20, 0, TAU);
    },
    rect(ctx) {
        ctx.rect(-20, -13, 40, 26);
    },
    triangle(ctx) {
        const h = 22 * Math.sqrt(3); // side 44, centred on the centroid
        ctx.moveTo(0, -2 * h / 3);
        ctx.lineTo(22, h / 3);
        ctx.lineTo(-22, h / 3);
        ctx.closePath();
    },
    line(ctx) {
        ctx.moveTo(-25, 0);
        ctx.lineTo(25, 0);
    },
    glasses(ctx) {
        ctx.moveTo(-3, 0);
        ctx.arc(-13, 0, 10, 0, TAU);
        ctx.moveTo(23, 0);
        ctx.arc(13, 0, 10, 0, TAU);
        ctx.moveTo(-3, 0);
        ctx.lineTo(3, 0);
    },
    hat(ctx) { // fedora: brim plus a pinched crown
        ctx.moveTo(-26, 8);
        ctx.lineTo(26, 8);
        ctx.moveTo(-15, 8);
        ctx.lineTo(-12, -14);
        ctx.lineTo(0, -10);
        ctx.lineTo(12, -14);
        ctx.lineTo(15, 8);
    },
    smile(ctx) { // lower arc, r 18
        const a0 = 0.15 * Math.PI, a1 = 0.85 * Math.PI;
        ctx.moveTo(18 * Math.cos(a0), -8 + 18 * Math.sin(a0));
        ctx.arc(0, -8, 18, a0, a1);
    }
};

export const SHAPE_TYPES = Object.keys(SHAPES);
export const ITEM_TYPES = [...SHAPE_TYPES, 'stroke'];
export const BASE_RADIUS = 25;

export function tracePath(ctx, item) {
    if (item.type === 'stroke') {
        item.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        return;
    }
    SHAPES[item.type]?.(ctx);
}

export function bindItem(item) {
    if (item.type === 'stroke') {
        const raw = item.points.map(anchorCandidates);
        item._anchors = raw.map((cands, i) => {
            if (cands.length < 2) return cands;
            const near = new Set([...(raw[i - 1] ?? []), ...(raw[i + 1] ?? [])]);
            return [...cands.filter(b => near.has(b)), ...cands.filter(b => !near.has(b))];
        });
    } else {
        item._anchor = { x: item.x, y: item.y, bones: anchorCandidates(item) };
    }
    return item;
}

function ensureBound(item) {
    const stale = item.type === 'stroke'
        ? !item._anchors || item._anchors.length !== item.points.length
        : !item._anchor || item._anchor.x !== item.x || item._anchor.y !== item.y;
    if (stale) bindItem(item);
}

export function anchorBones(item) {
    ensureBound(item);
    return item.type === 'stroke' ? item._anchors : [item._anchor.bones];
}

function firstMatrix(bones, matrixFor) {
    for (let i = 0; i < bones.length; i++) {
        const m = matrixFor(bones[i]);
        if (m) return m;
    }
    return null;
}

export function bindLook(look) {
    look.items.forEach(bindItem);
    return look;
}

export function traceItem(ctx, item, matrixFor) {
    if (item.type === 'stroke') return traceStroke(ctx, item, matrixFor);
    const trace = SHAPES[item.type];
    if (!trace) return false;
    ensureBound(item);
    const m = firstMatrix(item._anchor.bones, matrixFor);
    if (!m) return false;
    ctx.save();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.translate(item.x, item.y);
    ctx.rotate(item.rotation);
    ctx.scale(item.scale, item.scale);
    trace(ctx);
    ctx.restore(); // the path keeps its transformed coordinates
    return true;
}

// Each point goes through its own anchor's matrix, so the stroke bends at joints. A point whose bone isn't usable
// breaks the polyline into separate subpaths.
function traceStroke(ctx, item, matrixFor) {
    const pts = item.points;
    ensureBound(item);
    let pen = false, traced = false;
    for (let i = 0; i < pts.length; i++) {
        const m = firstMatrix(item._anchors[i], matrixFor);
        if (!m) {
            pen = false;
            continue;
        }
        const { x, y } = pts[i];
        const px = m[0] * x + m[2] * y + m[4];
        const py = m[1] * x + m[3] * y + m[5];
        if (pen) {
            ctx.lineTo(px, py);
            traced = true;
        } else {
            ctx.moveTo(px, py);
            pen = true;
        }
    }
    return traced;
}

function applyStyle(ctx, style) {
    ctx.lineWidth = style.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

export function drawItem(ctx, item, matrixFor, color, style) {
    applyStyle(ctx, style);
    ctx.strokeStyle = item.color || color;
    ctx.beginPath();
    if (traceItem(ctx, item, matrixFor)) ctx.stroke();
}

export function drawLook(ctx, look, matrixFor, color, style) {
    applyStyle(ctx, style);
    let current = null, pending = false;
    for (const item of look.items) {
        const c = item.color || color;
        if (c !== current) {
            if (pending) ctx.stroke();
            ctx.beginPath();
            ctx.strokeStyle = current = c;
            pending = false;
        }
        if (traceItem(ctx, item, matrixFor)) pending = true;
    }
    if (pending) ctx.stroke();
}

let idCounter = 0;
const newId = () => `i${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function createItem(type, fields = {}) {
    const item = { id: newId(), type, x: 0, y: 0, scale: 1, rotation: 0, color: null, ...fields };
    if (type === 'stroke') item.points = (fields.points ?? []).map(p => ({ x: p.x, y: p.y }));
    return bindItem(item);
}

function copyItem(item) {
    const out = {};
    for (const [k, v] of Object.entries(item)) {
        if (!k.startsWith('_')) out[k] = v;
    }
    if (item.points) out.points = item.points.map(p => ({ x: p.x, y: p.y }));
    return out;
}

export function copyLook(look) {
    return bindLook({ name: look.name, items: look.items.map(copyItem) });
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function sanitizeItem(v) {
    if (!v || typeof v !== 'object' || !ITEM_TYPES.includes(v.type)) return null;
    const item = {
        id: typeof v.id === 'string' && v.id ? v.id : newId(),
        type: v.type,
        x: isNum(v.x) ? v.x : 0,
        y: isNum(v.y) ? v.y : 0,
        scale: isNum(v.scale) && v.scale > 0 ? v.scale : 1,
        rotation: isNum(v.rotation) ? v.rotation : 0,
        color: typeof v.color === 'string' && COLOR_RE.test(v.color) ? v.color : null
    };
    if (v.type === 'stroke') {
        if (!Array.isArray(v.points)) return null;
        item.points = v.points.filter(p => p && isNum(p.x) && isNum(p.y)).map(p => ({ x: p.x, y: p.y }));
        if (item.points.length < 2) return null;
    }
    return bindItem(item);
}

export function sanitizeLook(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return null;
    return {
        name: typeof value.name === 'string' ? value.name : 'Custom',
        items: value.items.map(sanitizeItem).filter(Boolean)
    };
}

// ---- Presets (design §7), generated as data with the same format the editor produces ----

const P = MODEL_POINTS;
const { KP } = CONFIG;

// A point at fraction t along a bone, pushed `offset` model units sideways (positive = away from the body's
// vertical centre line, or upwards for a horizontal bone).
function onBone(bone, t, offset = 0) {
    const [a, b] = BONES[bone].map(i => P[i]);
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    const mx = a.x + t * dx, my = a.y + t * dy;
    const outward = Math.abs(dx) > Math.abs(dy) ? -ny : (mx - CONFIG.LOOKS.MODEL_WIDTH / 2) * nx;
    if (outward < 0) {
        nx = -nx;
        ny = -ny;
    }
    return { x: mx + offset * nx, y: my + offset * ny };
}

const boneStroke = (bone, t0, t1, offset = 0, color = null) =>
    createItem('stroke', { color, points: [onBone(bone, t0, offset), onBone(bone, t1, offset)] });
const at = (k) => ({ x: P[k].x, y: P[k].y });
const eyeDistance = Math.hypot(P[KP.L_EYE].x - P[KP.R_EYE].x, P[KP.L_EYE].y - P[KP.R_EYE].y);
// Old renderer's face ring: centred on the nose, radius = eye distance on the model. It anchors to the nose bones
// (NOSE_L, then NOSE_R) so it sits exactly on the nose and stays when one eye is hidden; live, its size follows the
// nose-eye distance rather than the eye distance.
const headRing = (color = null) => createItem('circle', { ...at(KP.NOSE), scale: eyeDistance / 20, color });

const STICK_BONES = ['SHOULDERS', 'L_UPPER', 'L_FORE', 'R_UPPER', 'R_FORE', 'L_SIDE', 'R_SIDE', 'HIPS',
    'L_THIGH', 'L_SHIN', 'R_THIGH', 'R_SHIN'];
const GLOW_STICK_COLORS = ['#39FF14', '#FF10F0', '#00E5FF', '#FFEA00', '#FF6A00', '#B026FF',
    '#FF073A', '#1F51FF', '#7DF9FF', '#FF5F1F', '#CCFF00', '#FF00A0'];

// Classic: the old renderer as data. One two-point stroke per CONFIG.CONNECTIONS entry, the face ring, and small
// rings at the 17 keypoints for the joint dots (r 3 model units, drawn with the pass line width they read as dots).
const classic = {
    name: 'Classic',
    items: [
        ...CONFIG.CONNECTIONS.map(([i, j]) => createItem('stroke', { points: [at(i), at(j)] })),
        headRing(),
        ...CONFIG.MODEL_POSE.map((_, k) => createItem('circle', { ...at(k), scale: 0.15 }))
    ]
};

// Glow Sticks: one stick per bone with gaps at the joints, each its own colour, plus a head ring.
const glowSticks = {
    name: 'Glow Sticks',
    items: [
        ...STICK_BONES.map((bone, i) => boneStroke(bone, 0.08, 0.92, 0, GLOW_STICK_COLORS[i])),
        headRing('#FFFFFF')
    ]
};

const party = {
    name: 'Party',
    items: [
        createItem('glasses', { x: 150, y: 58, color: '#00E5FF' }),
        createItem('smile', { x: 150, y: 86, scale: 0.6, color: '#FF10F0' }),
        createItem('smile', { x: 150, y: 128, scale: 1.3, color: '#FFEA00' }),     // collar
        createItem('circle', { x: 150, y: 205, scale: 1.1, color: '#39FF14' }),    // chest
        createItem('stroke', { points: [{ x: 168, y: 146 }, { x: 166, y: 296 }], color: '#FF073A' }), // suspenders
        createItem('stroke', { points: [{ x: 132, y: 146 }, { x: 134, y: 296 }], color: '#FF073A' }),
        createItem('stroke', { points: [{ x: 120, y: 298 }, { x: 180, y: 298 }], color: '#B026FF' }), // belt
        createItem('stroke', { points: [{ x: 120, y: 308 }, { x: 180, y: 308 }], color: '#B026FF' }),
        createItem('circle', { ...at(KP.L_KNEE), scale: 0.6, color: '#FF6A00' }),
        createItem('circle', { ...at(KP.R_KNEE), scale: 0.6, color: '#FF6A00' }),
        ...['L_FORE', 'R_FORE', 'L_SHIN', 'R_SHIN'].map(bone => boneStroke(bone, 0.3, 0.7, 0, '#1F51FF'))
    ]
};

// EL Suit: a hat, and wires on both sides of every limb and along the outside of the torso, in the person colour.
// Each wire is trimmed at the joints so all of it anchors to the bone it follows. Between the upper arm and the torso
// the wires are closer to the other bone near the shoulder, hence the longer trims there.
const EL_OFFSET = 12;
const EL_WIRES = [ // [bone, t0, t1, offset]
    ['L_UPPER', 0.15, 0.85, EL_OFFSET], ['L_UPPER', 0.45, 0.85, -EL_OFFSET],
    ['R_UPPER', 0.15, 0.85, EL_OFFSET], ['R_UPPER', 0.45, 0.85, -EL_OFFSET],
    ...['L_FORE', 'R_FORE', 'L_THIGH', 'L_SHIN', 'R_THIGH', 'R_SHIN']
        .flatMap(bone => [[bone, 0.15, 0.85, EL_OFFSET], [bone, 0.15, 0.85, -EL_OFFSET]]),
    ['L_SIDE', 0.3, 0.9, EL_OFFSET], ['R_SIDE', 0.3, 0.9, EL_OFFSET], ['SHOULDERS', 0.1, 0.9, EL_OFFSET]
];
const elSuit = {
    name: 'EL Suit',
    items: [
        createItem('hat', { x: 150, y: 36, scale: 1.2 }),
        ...EL_WIRES.map(([bone, t0, t1, offset]) => boneStroke(bone, t0, t1, offset))
    ]
};

export const PRESETS = { classic, glowSticks, party, elSuit };
