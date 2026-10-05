// Rig: maps items placed on the model pose (CONFIG.MODEL_POSE, model space) onto a live person (add-look-editor
// design §2-§3). Pure logic, no DOM.
//
// API
//   BONES                       bone name -> [pointIndexA, pointIndexB] (indices into CONFIG.KP, incl. NECK/PELVIS)
//   BONE_NAMES                  Object.keys(BONES)
//   BODY_BONES                  the bones nearestBone chooses from (design §2). The other bones (FACE_BONES: nose-eye,
//                               eye-ear) are only used by points sitting on a keypoint, see anchorCandidates.
//   MODEL_POINTS                the model pose with NECK and PELVIS added: 19 x { x, y, score: 1 }
//   IDENTITY                    [1, 0, 0, 1, 0, 0]
//   identityMatrixFor(name)     always IDENTITY; the matrixFor to use when drawing in model space (the editor)
//   withVirtualPoints(points, keypoints = points, out = [])
//                               -> 19 x { x, y, score }; points[i] give x/y (e.g. canvas pixels), keypoints[i].score
//                                  the score. Reuses the objects in `out`.
//   nearestBone({ x, y })       -> the body bone whose model segment is closest (projection clamped; ties: first)
//   anchorCandidates({ x, y })  -> ordered bone names to anchor a model point to. A point within LOOKS.JOINT_SNAP of a
//                                  keypoint gets every bone ending at that keypoint (each maps it exactly, so any
//                                  usable one will do; body bones first, BONES order). Any other point gets
//                                  [nearestBone(p)].
//   handedness(pts)             -> 1 / -1, or 0 if unknown or too side-on (|normalised cross| < LOOKS.MIN_FACING)
//   isReflected(pts, previous = false) -> reflected vs the model; `previous` when handedness is 0
//   boneMatrix(name, pts, reflected = false, out = new Array(6))
//                               -> canvas matrix [a, b, c, d, e, f] (ctx.transform order) mapping the bone's model
//                                  endpoints onto pts' endpoints, or null when either endpoint's score is
//                                  <= CONFIG.TRACKING.MIN_CONFIDENCE (or the live bone has zero length)
//   class Rig                   one person's bone matrices for the current frame; allocation-free after construction.
//                               Keep one Rig per tracked person (e.g. a Map by instance id): it remembers the last
//                               confident reflection decision (hysteresis).
//     rig.update(points, keypoints = points, prior = false) -> rig
//                               recomputes points, reflection and every bone matrix. `prior` is the reflection to
//                               assume while it has never been decided for this person: pass mapping.mirrored (a
//                               front-facing person on a mirrored canvas is reflected).
//     rig.reset()               forget the reflection history (when the Rig is reused for another person)
//     rig.matrixFor(name)       -> matrix or null (a bound function; pass it to drawLook). Also null for a bone
//                               whose scale is < LOOKS.MIN_BONE_SCALE_RATIO x the person's largest body-bone scale.
//     rig.reflected             -> boolean
//
// Matrices map model coordinates to whatever space `points` is in. The renderer passes canvas-pixel points
// (renderer.mapping.mapPoint, mirrored with the front camera), so a mirrored preview is caught by the reflection
// check and items stay on the correct side of their bones.
import { CONFIG } from '../config.js';

const { KP } = CONFIG;
const POINT_COUNT = 19;

export const BONES = {
    EYES: [KP.L_EYE, KP.R_EYE],
    SHOULDERS: [KP.L_SHOULDER, KP.R_SHOULDER],
    SPINE: [KP.NECK, KP.PELVIS],
    L_UPPER: [KP.L_SHOULDER, KP.L_ELBOW],
    L_FORE: [KP.L_ELBOW, KP.L_WRIST],
    R_UPPER: [KP.R_SHOULDER, KP.R_ELBOW],
    R_FORE: [KP.R_ELBOW, KP.R_WRIST],
    L_SIDE: [KP.L_SHOULDER, KP.L_HIP],
    R_SIDE: [KP.R_SHOULDER, KP.R_HIP],
    HIPS: [KP.L_HIP, KP.R_HIP],
    L_THIGH: [KP.L_HIP, KP.L_KNEE],
    L_SHIN: [KP.L_KNEE, KP.L_ANKLE],
    R_THIGH: [KP.R_HIP, KP.R_KNEE],
    R_SHIN: [KP.R_KNEE, KP.R_ANKLE],
    // Face bones: short and jittery, so never chosen by nearestBone; they let points on the nose and ears (the Classic
    // face lines and dots) map exactly.
    NOSE_L: [KP.NOSE, KP.L_EYE],
    NOSE_R: [KP.NOSE, KP.R_EYE],
    EAR_L: [KP.L_EYE, KP.L_EAR],
    EAR_R: [KP.R_EYE, KP.R_EAR]
};
export const BONE_NAMES = Object.keys(BONES);
export const FACE_BONES = ['NOSE_L', 'NOSE_R', 'EAR_L', 'EAR_R'];
export const BODY_BONES = BONE_NAMES.filter(name => !FACE_BONES.includes(name));

export const IDENTITY = Object.freeze([1, 0, 0, 1, 0, 0]);
export const identityMatrixFor = () => IDENTITY;

// Fills out[0..18] with { x, y, score }: the 17 keypoints plus NECK and PELVIS. A virtual point's score is the lower
// of its two sources, so it is confident only when both are.
export function withVirtualPoints(points, keypoints = points, out = []) {
    for (let i = 0; i < POINT_COUNT; i++) {
        if (!out[i]) out[i] = { x: 0, y: 0, score: 0 };
    }
    for (let i = 0; i < 17; i++) {
        const p = points[i], o = out[i];
        o.x = p ? p.x : 0;
        o.y = p ? p.y : 0;
        o.score = p && keypoints[i] ? (keypoints[i].score ?? 0) : 0;
    }
    midpoint(out[KP.NECK], out[KP.L_SHOULDER], out[KP.R_SHOULDER]);
    midpoint(out[KP.PELVIS], out[KP.L_HIP], out[KP.R_HIP]);
    return out;
}

function midpoint(o, a, b) {
    o.x = (a.x + b.x) / 2;
    o.y = (a.y + b.y) / 2;
    o.score = Math.min(a.score, b.score);
}

export const MODEL_POINTS = withVirtualPoints(CONFIG.MODEL_POSE, CONFIG.MODEL_POSE.map(() => ({ score: 1 })));

function segmentDistanceSq(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    const ex = a.x + t * dx - p.x, ey = a.y + t * dy - p.y;
    return ex * ex + ey * ey;
}

export function nearestBone(p) {
    let best = BODY_BONES[0], bestD = Infinity;
    for (const name of BODY_BONES) {
        const [a, b] = BONES[name];
        const d = segmentDistanceSq(p, MODEL_POINTS[a], MODEL_POINTS[b]);
        if (d < bestD) {
            bestD = d;
            best = name;
        }
    }
    return best;
}

export function anchorCandidates(p) {
    const snap = CONFIG.LOOKS.JOINT_SNAP;
    for (let k = 0; k < POINT_COUNT; k++) {
        const m = MODEL_POINTS[k];
        if (Math.abs(p.x - m.x) <= snap && Math.abs(p.y - m.y) <= snap) {
            return BONE_NAMES.filter(name => BONES[name].includes(k));
        }
    }
    return [nearestBone(p)];
}

const confident = (p) => p.score > CONFIG.TRACKING.MIN_CONFIDENCE;

// Which way the body faces in this space: sign of cross(L - R, below - R), normalised by |below - R|^2 so that it
// measures how frontal the body is (about 0.5 for the model torso, 1 for the model head) and not its size. Uses the
// torso (shoulders + pelvis, design §3); when the torso isn't visible it falls back to the head (eyes + nose) so
// close-up selfies on a mirrored front camera still get the check. 0 = unknown or side-on.
const HANDEDNESS_TRIPLES = [[KP.L_SHOULDER, KP.R_SHOULDER, KP.PELVIS], [KP.L_EYE, KP.R_EYE, KP.NOSE]];
export function handedness(pts) {
    for (const [l, r, below] of HANDEDNESS_TRIPLES) {
        const L = pts[l], R = pts[r], B = pts[below];
        if (!confident(L) || !confident(R) || !confident(B)) continue;
        const bx = B.x - R.x, by = B.y - R.y, n = bx * bx + by * by;
        if (n === 0) return 0;
        const facing = ((L.x - R.x) * by - (L.y - R.y) * bx) / n;
        return Math.abs(facing) < CONFIG.LOOKS.MIN_FACING ? 0 : Math.sign(facing);
    }
    return 0;
}

// The model pose's handedness (both triples agree on the model).
const MODEL_HANDEDNESS = handedness(MODEL_POINTS);

export function isReflected(pts, previous = false) {
    const h = handedness(pts);
    return h === 0 ? previous : h !== MODEL_HANDEDNESS;
}

// Similarity transform A0->A, B0->B as p' = A + k(p - A0) with k = d / d0 (complex numbers). When reflected, the
// model is first mirrored across the bone axis: p' = A + w * conj(p - A0) with w = d / conj(d0); the matrix still
// maps A0->A and B0->B but flips which side of the bone an offset lands on.
export function boneMatrix(name, pts, reflected = false, out = new Array(6)) {
    const [ia, ib] = BONES[name];
    const A = pts[ia], B = pts[ib];
    if (!confident(A) || !confident(B)) return null;
    const A0 = MODEL_POINTS[ia], B0 = MODEL_POINTS[ib];
    const d0x = B0.x - A0.x, d0y = B0.y - A0.y;
    const dx = B.x - A.x, dy = B.y - A.y;
    if (dx * dx + dy * dy < 1e-6) return null;
    const n = d0x * d0x + d0y * d0y;
    let a, b, c, d;
    if (reflected) {
        a = (dx * d0x - dy * d0y) / n;
        b = (dx * d0y + dy * d0x) / n;
        c = b;
        d = -a;
    } else {
        a = (dx * d0x + dy * d0y) / n;
        b = (dy * d0x - dx * d0y) / n;
        c = -b;
        d = a;
    }
    out[0] = a;
    out[1] = b;
    out[2] = c;
    out[3] = d;
    out[4] = A.x - (a * A0.x + c * A0.y);
    out[5] = A.y - (b * A0.x + d * A0.y);
    return out;
}

export class Rig {
    constructor() {
        this.points = withVirtualPoints([]);
        this.reflected = false;
        this.decided = false; // whether reflected came from a confident handedness (vs the prior)
        this.buffers = {};
        this.matrices = {};
        for (const name of BONE_NAMES) {
            this.buffers[name] = new Array(6).fill(0);
            this.matrices[name] = null;
        }
        this.matrixFor = (name) => this.matrices[name] ?? null;
    }

    reset() {
        this.decided = false;
    }

    update(points, keypoints = points, prior = false) {
        withVirtualPoints(points, keypoints, this.points);
        const h = handedness(this.points);
        if (h !== 0) {
            this.reflected = h !== MODEL_HANDEDNESS;
            this.decided = true;
        } else if (!this.decided) {
            this.reflected = prior;
        }

        // |k| (live length / model length) of every usable bone. The largest body bone stands for the person's size
        // (face bones are short, so noisier; they only count when no body bone is visible).
        let maxBodySq = 0, maxAnySq = 0;
        for (const name of BONE_NAMES) {
            const m = boneMatrix(name, this.points, this.reflected, this.buffers[name]);
            this.matrices[name] = m;
            if (!m) continue;
            const scaleSq = m[0] * m[0] + m[1] * m[1];
            maxAnySq = Math.max(maxAnySq, scaleSq);
            if (!FACE_BONES.includes(name)) maxBodySq = Math.max(maxBodySq, scaleSq);
        }
        const minScaleSq = (maxBodySq || maxAnySq) * CONFIG.LOOKS.MIN_BONE_SCALE_RATIO ** 2;
        for (const name of BONE_NAMES) {
            const m = this.matrices[name];
            if (m && m[0] * m[0] + m[1] * m[1] < minScaleSq) this.matrices[name] = null;
        }
        return this;
    }
}
