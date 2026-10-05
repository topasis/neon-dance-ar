import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InstanceTracker } from '../js/logic/tracker.js';
import { CONFIG } from '../js/config.js';

const { RENDER_GRACE_MS, GRACE_PERIOD_MS, MAX_DISTANCE_RATIO, MIN_MATCH_DIAG_PX } = CONFIG.TRACKING;
const DT = 40; // ms between estimates (25 Hz)

// A 17-keypoint pose filling a w x h box centred on (cx, cy): columns at -w/2, 0, +w/2 and six rows from -h/2 to +h/2.
function pose(cx, cy, w = 150, h = 350, score = 0.9) {
    const keypoints = Array.from({ length: 17 }, (_, k) => ({
        x: cx + (w / 2) * ((k % 3) - 1),
        y: cy + h * (Math.floor(k / 3) / 5 - 0.5),
        score
    }));
    return { score: 0.8, keypoints };
}

const ids = (instances) => instances.map(i => i.id);

test('people crossing keep their IDs and colours', () => {
    const tracker = new InstanceTracker();
    // A walks right on the upper path, B walks left 60 px lower; they pass each other mid-way.
    let byId = null;
    for (let s = 0; s <= 20; s++) {
        const a = pose(100 + 20 * s, 220);
        const b = pose(500 - 20 * s, 280);
        const out = tracker.update(s % 2 ? [b, a] : [a, b], s * DT);
        assert.equal(out.length, 2);
        const at = (cx, cy) => out.find(i => Math.abs(i.bbox.cx - cx) < 1 && Math.abs(i.bbox.cy - cy) < 1);
        const now = { a: at(100 + 20 * s, 220), b: at(500 - 20 * s, 280) };
        if (!byId) byId = { a: [now.a.id, now.a.colorIndex], b: [now.b.id, now.b.colorIndex] };
        assert.deepEqual([now.a.id, now.a.colorIndex], byId.a, `A at step ${s}`);
        assert.deepEqual([now.b.id, now.b.colorIndex], byId.b, `B at step ${s}`);
    }
});

test('matching is nearest-first across all pairs, not in instance order', () => {
    const tracker = new InstanceTracker();
    tracker.update([pose(200, 240), pose(260, 240)], 0); // ids 0 and 1
    // One detection, much closer to instance 1 than to instance 0 (which comes first in the list).
    const out = tracker.update([pose(250, 240)], DT);
    assert.deepEqual(ids(out), [0, 1]); // 0 is unseen but still within the render grace
    const one = tracker.instances.find(i => i.id === 1);
    assert.equal(one.lastSeen, DT);
    assert.equal(tracker.instances.find(i => i.id === 0).lastSeen, 0);
    assert.equal(tracker.nextId, 2, 'no new instance');
});

test('a pose with no confident keypoints creates no instance and matches none', () => {
    const tracker = new InstanceTracker();
    const empty = pose(0, 0, 50, 50, 0.1);
    assert.deepEqual(tracker.update([empty], 0), []);
    assert.equal(tracker.instances.length, 0);

    // An existing person near the top-left corner is not "matched" by the empty pose.
    tracker.update([pose(60, 60, 80, 100)], DT);
    const t = DT + RENDER_GRACE_MS + 1;
    assert.deepEqual(tracker.update([empty], t), [], 'existing instance not refreshed, so no longer drawn');
    assert.equal(tracker.instances[0].lastSeen, DT);
    assert.equal(tracker.nextId, 1);
});

test('the first person is cyan', () => {
    const tracker = new InstanceTracker();
    const [inst] = tracker.update([pose(320, 240)], 0);
    assert.equal(CONFIG.NEON_COLORS[inst.colorIndex], '#00FFFF');
});

test('five people get five different colours, the lowest palette indices', () => {
    const tracker = new InstanceTracker();
    const out = tracker.update([0, 1, 2, 3, 4].map(i => pose(100 + 250 * i, 240)), 0);
    assert.deepEqual(out.map(i => i.colorIndex).sort(), [0, 1, 2, 3, 4]);
});

test('a new person gets the lowest colour not used by any tracked instance', () => {
    const tracker = new InstanceTracker();
    const people = [pose(100, 240), pose(500, 240), pose(900, 240)];
    tracker.update(people, 0); // colours 0, 1, 2
    // The middle person leaves. While they are in the grace period their colour stays reserved.
    tracker.update([people[0], people[2]], DT);
    let out = tracker.update([people[0], people[2], pose(1300, 240)], 2 * DT);
    assert.deepEqual(out.find(i => i.bbox.cx === 1300).colorIndex, 3);
    // After the grace period colour 1 is free again and is the lowest free one.
    const t = DT + GRACE_PERIOD_MS + 1;
    out = tracker.update([people[0], people[2], pose(1300, 240), pose(1700, 240)], t);
    assert.deepEqual(out.map(i => i.colorIndex).sort(), [0, 1, 2, 3]);
    assert.equal(out.find(i => i.bbox.cx === 1700).colorIndex, 1);
});

test('colours stay unique on screen even with more tracked instances than palette colours', () => {
    const tracker = new InstanceTracker();
    // Five people appear, then five others elsewhere: ten tracked, the first five only in their grace period.
    tracker.update([0, 1, 2, 3, 4].map(i => pose(100 + 250 * i, 240)), 0);
    const out = tracker.update([0, 1, 2, 3, 4].map(i => pose(100 + 250 * i, 2000)), RENDER_GRACE_MS + 1);
    assert.equal(tracker.instances.length, 10);
    assert.equal(out.length, 5);
    assert.equal(new Set(out.map(i => i.colorIndex)).size, 5);
});

test('a person who leaves disappears after the render grace but can be re-matched during the grace period', () => {
    const tracker = new InstanceTracker();
    const p = pose(320, 240);
    tracker.update([p], 0);
    let t = 0;
    while (t + DT <= RENDER_GRACE_MS) {
        t += DT;
        assert.deepEqual(ids(tracker.update([], t)), [0], `still drawn at ${t} ms`);
    }
    t += DT;
    assert.deepEqual(tracker.update([], t), [], `gone at ${t} ms`);
    assert.ok(t <= RENDER_GRACE_MS + DT);

    // Back before the (longer) grace period ends: same ID.
    assert.deepEqual(ids(tracker.update([p], GRACE_PERIOD_MS - 1)), [0]);
    // Gone for longer than the grace period: dropped, a returning person is new.
    tracker.update([], 2 * GRACE_PERIOD_MS);
    assert.equal(tracker.instances.length, 0);
    assert.deepEqual(ids(tracker.update([p], 2 * GRACE_PERIOD_MS + DT)), [1]);
});

test('a one-estimate dropout keeps the ID and colour and the skeleton stays drawn', () => {
    const tracker = new InstanceTracker();
    tracker.update([pose(100, 240), pose(500, 240)], 0);
    const missed = tracker.update([pose(500, 240)], DT); // the left person is missed once
    assert.deepEqual(ids(missed).sort(), [0, 1]);
    const back = tracker.update([pose(110, 240), pose(500, 240)], 2 * DT);
    const left = back.find(i => i.bbox.cx === 110);
    assert.deepEqual([left.id, left.colorIndex], [0, 0]);
});

test('low-confidence keypoints keep their position and do not update their filter', () => {
    const tracker = new InstanceTracker();
    const WRIST = 9;
    tracker.update([pose(320, 240)], 0);
    tracker.update([pose(320, 240)], DT);
    const before = { ...tracker.instances[0].keypoints[WRIST] };
    const filter = tracker.instances[0].filters[WRIST];
    const filterState = JSON.stringify(filter);

    const occluded = pose(320, 240);
    occluded.keypoints[WRIST] = { x: 5, y: 5, score: 0.1 }; // wrong position, low score
    const [inst] = tracker.update([occluded], 2 * DT);
    assert.equal(inst.keypoints[WRIST].x, before.x);
    assert.equal(inst.keypoints[WRIST].y, before.y);
    assert.equal(inst.keypoints[WRIST].score, 0.1, 'new low score is stored, so the renderer skips it');
    assert.ok(inst.keypoints[WRIST].score <= CONFIG.TRACKING.MIN_CONFIDENCE);
    assert.equal(JSON.stringify(filter), filterState, 'filter state unchanged');
});

test('a new instance with a low-confidence keypoint does not initialise that filter', () => {
    const tracker = new InstanceTracker();
    const p = pose(320, 240);
    p.keypoints[0] = { x: 1, y: 2, score: 0.05 };
    const [inst] = tracker.update([p], 0);
    assert.deepEqual(inst.keypoints[0], { x: 1, y: 2, score: 0.05 });
    assert.equal(inst.filters[0].x.tPrev, null);
});

test('the matching distance scales with person size, not resolution', () => {
    // The same scene at 640x480 and 1280x720: everything scaled by (2, 1.5). A person jumps 130 px (at 640x480).
    for (const [sx, sy] of [[1, 1], [2, 1.5]]) {
        const tracker = new InstanceTracker();
        tracker.update([pose(200 * sx, 240 * sy, 150 * sx, 350 * sy)], 0);
        const out = tracker.update([pose(330 * sx, 240 * sy, 150 * sx, 350 * sy)], DT);
        assert.deepEqual(ids(out), [0], `matched at scale ${sx}x${sy}`);
    }
    // A small (far away) person making the same jump is a different person.
    const tracker = new InstanceTracker();
    tracker.update([pose(200, 240, 30, 70)], 0);
    const out = tracker.update([pose(330, 240, 30, 70)], DT);
    assert.deepEqual(ids(out).sort(), [0, 1]);
});

test('a pose with a single confident keypoint can still re-match (diagonal floor)', () => {
    const tracker = new InstanceTracker();
    const single = (x, y) => {
        const p = pose(320, 240, 150, 350, 0.1);
        p.keypoints[10] = { x, y, score: 0.9 };
        return p;
    };
    tracker.update([single(100, 200)], 0);
    const step = (MAX_DISTANCE_RATIO * MIN_MATCH_DIAG_PX) - 1;
    assert.deepEqual(ids(tracker.update([single(100 + step, 200)], DT)), [0], 'moved within the floor threshold');
    const out = tracker.update([single(100 + step + MAX_DISTANCE_RATIO * MIN_MATCH_DIAG_PX + 5, 200)], 2 * DT);
    assert.deepEqual(ids(out).sort(), [0, 1], 'a jump beyond the floor threshold is a new person');
});

test('the same poses and timestamps give identical results', () => {
    const run = () => {
        const tracker = new InstanceTracker();
        let out;
        for (let s = 0; s < 10; s++) out = tracker.update([pose(100 + 13 * s, 240 + (s % 3)), pose(600 - 9 * s, 250)], s * 33.3);
        return out.map(({ id, colorIndex, keypoints }) => ({ id, colorIndex, keypoints }));
    };
    assert.deepEqual(run(), run());
});

test('reset forgets instances and filter state', () => {
    const tracker = new InstanceTracker();
    tracker.update([pose(320, 240), pose(800, 240)], 0);
    tracker.reset();
    assert.equal(tracker.instances.length, 0);
    const [inst] = tracker.update([pose(320, 240)], DT);
    assert.deepEqual([inst.id, inst.colorIndex], [0, 0]);
    assert.equal(inst.filters[0].x.tPrev, DT / 1000, 'fresh filter');
});
