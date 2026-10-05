import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import {
    Rig, BONES, BONE_NAMES, MODEL_POINTS, anchorCandidates, boneMatrix, nearestBone, withVirtualPoints, isReflected
} from '../js/logic/rig.js';

const { KP } = CONFIG;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} != ${b}`);
const apply = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
const livePose = (fn, score = 0.9) => CONFIG.MODEL_POSE.map(p => ({ ...fn(p), score }));

// A few model-space test points spread over the body, including points off the bones.
const SAMPLES = [{ x: 150, y: 30 }, { x: 150, y: 200 }, { x: 230, y: 200 }, { x: 60, y: 260 }, { x: 200, y: 480 },
    { x: 100, y: 380 }, { x: 150, y: 58 }];

test('model pose as live keypoints gives identity for every bone', () => {
    const rig = new Rig().update(livePose(p => p));
    assert.equal(rig.reflected, false);
    for (const name of BONE_NAMES) {
        const m = rig.matrixFor(name);
        assert.ok(m, name);
        [1, 0, 0, 1, 0, 0].forEach((v, i) => near(m[i], v, `${name}[${i}]`));
    }
});

test('translate + scale x2 + rotate 90deg maps model points where expected, through any bone', () => {
    // (x, y) -> rotate 90deg of 2(x, y), then translate: (-2y, 2x) + (500, -40)
    const T = (p) => ({ x: -2 * p.y + 500, y: 2 * p.x - 40 });
    const rig = new Rig().update(livePose(T));
    assert.equal(rig.reflected, false, 'a rotation keeps handedness');
    for (const p of SAMPLES) {
        const q = apply(rig.matrixFor(nearestBone(p)), p);
        const e = T(p);
        near(q.x, e.x, `x of ${JSON.stringify(p)}`);
        near(q.y, e.y, `y of ${JSON.stringify(p)}`);
    }
});

test('each bone maps its own model endpoints onto the live endpoints', () => {
    const live = livePose(p => ({ x: p.x * 0.7 + 13 + Math.sin(p.y) * 20, y: p.y * 0.9 + Math.cos(p.x) * 15 }));
    const rig = new Rig().update(live);
    const pts = withVirtualPoints(live);
    for (const [name, [a, b]] of Object.entries(BONES)) {
        const m = rig.matrixFor(name);
        for (const k of [a, b]) {
            const q = apply(m, MODEL_POINTS[k]);
            near(q.x, pts[k].x, `${name} ${k} x`);
            near(q.y, pts[k].y, `${name} ${k} y`);
        }
    }
});

test('a mirrored body is detected and offsets stay on the same side of the body', () => {
    const M = (p) => ({ x: 600 - p.x, y: p.y }); // mirrored around x = 300, keypoint labels unchanged
    const rig = new Rig().update(livePose(M));
    assert.equal(rig.reflected, true);
    for (const p of SAMPLES) {
        const q = apply(rig.matrixFor(nearestBone(p)), p);
        near(q.x, M(p).x, `x of ${JSON.stringify(p)}`);
        near(q.y, M(p).y, `y of ${JSON.stringify(p)}`);
    }
    // Without the reflection fix, a point above the eyes (a hat) would land below them.
    const hat = { x: 150, y: 30 };
    const wrong = apply(boneMatrix('EYES', withVirtualPoints(livePose(M)), false), hat);
    assert.ok(wrong.y > 58, 'pure similarity flips the hat under the eyes');
});

test('reflection check falls back to the head when the torso is not visible', () => {
    const M = (p) => ({ x: 600 - p.x, y: p.y });
    const live = livePose(M).map((p, k) => (k <= KP.R_EYE ? p : { ...p, score: 0.1 }));
    assert.equal(new Rig().update(live).reflected, true);
    const none = livePose(M).map(p => ({ ...p, score: 0.1 }));
    assert.equal(isReflected(withVirtualPoints(none)), false, 'unknown handedness means no reflection');
});

test('a bone with an unconfident endpoint is unusable; virtual points need both sources', () => {
    const live = livePose(p => p);
    live[KP.L_ELBOW].score = CONFIG.TRACKING.MIN_CONFIDENCE; // not above the threshold
    live[KP.R_HIP].score = 0.1;
    const rig = new Rig().update(live);
    for (const name of ['L_UPPER', 'L_FORE', 'R_SIDE', 'HIPS', 'R_THIGH', 'SPINE']) assert.equal(rig.matrixFor(name), null, name);
    for (const name of ['EYES', 'SHOULDERS', 'R_UPPER', 'L_SIDE', 'L_THIGH', 'R_SHIN']) assert.ok(rig.matrixFor(name), name);
});

test('Rig reuses its matrix buffers across updates', () => {
    const rig = new Rig();
    const m1 = rig.update(livePose(p => p)).matrixFor('SPINE');
    const m2 = rig.update(livePose(p => ({ x: p.x + 5, y: p.y }))).matrixFor('SPINE');
    assert.equal(m1, m2);
    near(m2[4], 5, 'updated in place');
});

test('nearestBone anchors head, chest and knee items as the design describes', () => {
    assert.equal(nearestBone({ x: 150, y: 58 }), 'EYES');   // glasses
    assert.equal(nearestBone({ x: 150, y: 30 }), 'EYES');   // hat
    assert.equal(nearestBone({ x: 150, y: 205 }), 'SPINE'); // chest circle
    assert.equal(nearestBone({ x: 230, y: 180 }), 'L_UPPER');
    assert.equal(nearestBone({ x: 120, y: 470 }), 'R_SHIN');
});

test('anchorCandidates: keypoints get every bone ending there, other points their nearest body bone', () => {
    assert.deepEqual(anchorCandidates(MODEL_POINTS[KP.L_SHOULDER]), ['SHOULDERS', 'L_UPPER', 'L_SIDE']);
    assert.deepEqual(anchorCandidates(MODEL_POINTS[KP.NOSE]), ['NOSE_L', 'NOSE_R']);
    assert.deepEqual(anchorCandidates(MODEL_POINTS[KP.NECK]), ['SPINE']);
    assert.deepEqual(anchorCandidates({ x: 150, y: 30 }), ['EYES']);
    assert.deepEqual(anchorCandidates({ x: 190, y: 370 }), ['L_THIGH']);
});

function rng(seed) {
    return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Side-on: the torso seen edge-on (shoulders and hips 2 px apart), every keypoint jittered by up to +-2 px.
function sideOnFrame(random) {
    const j = () => (random() - 0.5) * 4;
    return CONFIG.MODEL_POSE.map((p, k) => ({ x: 300 + (k % 2 ? 1 : -1) + (p.x - 150) * 0.02 + j(), y: p.y + j(), score: 0.9 }));
}

test('side-on jitter does not flip the reflection flag (hysteresis)', () => {
    const random = rng(42);
    for (const start of [false, true]) {
        const rig = new Rig();
        // A few frontal frames decide the side first (start = true: mirrored, e.g. front camera).
        for (let i = 0; i < 3; i++) rig.update(livePose(p => ({ x: start ? 600 - p.x : p.x, y: p.y })));
        assert.equal(rig.reflected, start);
        let flips = 0, prev = rig.reflected;
        for (let f = 0; f < 100; f++) {
            rig.update(sideOnFrame(random));
            if (rig.reflected !== prev) flips++;
            prev = rig.reflected;
        }
        assert.equal(flips, 0, `start ${start}`);
        assert.equal(rig.reflected, start);
    }
});

test('the prior applies until a confident decision; reset forgets it', () => {
    const rig = new Rig();
    const legsOnly = livePose(p => p).map((p, k) => ({ ...p, score: k >= KP.L_KNEE ? 0.9 : 0.1 }));
    assert.equal(rig.update(legsOnly, legsOnly, true).reflected, true, 'prior = mirrored canvas');
    rig.update(livePose(p => p), undefined, true);
    assert.equal(rig.reflected, false, 'a frontal, unmirrored body overrides the prior');
    assert.equal(rig.update(legsOnly, legsOnly, true).reflected, false, 'history beats the prior');
    rig.reset();
    assert.equal(rig.update(legsOnly, legsOnly, true).reflected, true, 'after reset the prior applies again');
});

test('a bone much shorter than the body (side-on eyes) is unusable', () => {
    const live = livePose(p => p);
    live[KP.L_EYE] = { x: 150.5, y: 58, score: 0.9 };
    live[KP.R_EYE] = { x: 149.5, y: 58, score: 0.9 };
    const rig = new Rig().update(live);
    assert.ok(boneMatrix('EYES', withVirtualPoints(live)), 'confident endpoints');
    assert.equal(rig.matrixFor('EYES'), null, 'but 1/24 of the model length');
    assert.ok(rig.matrixFor('SHOULDERS'));
});
