import { OneEuroFilter } from './filters.js';
import { CONFIG } from '../config.js';

// Tracks people across estimates in video pixel coordinates. Pure apart from its own state: time comes from the
// caller, so the same poses and timestamps always give the same result.
export class InstanceTracker {
    constructor() {
        this.reset();
    }

    // Forgets every tracked instance and its filter state (e.g. when the camera restarts).
    reset() {
        this.instances = [];
        this.nextId = 0;
    }

    // timestampMs is when the poses were estimated (captured before inference started).
    // Returns the instances to draw: those seen within the last RENDER_GRACE_MS.
    update(detectedPoses, timestampMs) {
        const { MAX_DISTANCE_RATIO, MIN_MATCH_DIAG_PX, GRACE_PERIOD_MS, RENDER_GRACE_MS } = CONFIG.TRACKING;

        // Poses without a confident keypoint have no position to match on.
        const poses = [];
        for (const pose of detectedPoses) {
            const bbox = this.getBbox(pose.keypoints);
            if (bbox) poses.push({ pose, bbox });
        }

        // Global nearest-first matching: every (instance, pose) pair within the threshold, closest first.
        const pairs = [];
        this.instances.forEach((inst, i) => {
            poses.forEach(({ bbox }, j) => {
                const dist = Math.hypot(bbox.cx - inst.bbox.cx, bbox.cy - inst.bbox.cy);
                const diag = Math.max(inst.bbox.diag, bbox.diag, MIN_MATCH_DIAG_PX);
                if (dist <= MAX_DISTANCE_RATIO * diag) pairs.push({ i, j, dist });
            });
        });
        pairs.sort((a, b) => a.dist - b.dist);

        const instMatched = new Array(this.instances.length).fill(false);
        const poseMatched = new Array(poses.length).fill(false);
        for (const { i, j } of pairs) {
            if (instMatched[i] || poseMatched[j]) continue;
            instMatched[i] = poseMatched[j] = true;
            this.applyPose(this.instances[i], poses[j], timestampMs);
        }

        // Unmatched instances stay available for re-matching during the grace period.
        this.instances = this.instances.filter((inst, i) => instMatched[i] || timestampMs - inst.lastSeen < GRACE_PERIOD_MS);

        poses.forEach((p, j) => {
            if (poseMatched[j]) return;
            const inst = {
                id: this.nextId++,
                colorIndex: this.lowestFreeIndex('colorIndex', CONFIG.NEON_COLORS.length, timestampMs),
                // Look slot (Person N = slot N-1), kept while tracked.
                slot: this.lowestFreeIndex('slot', CONFIG.TRACKING.MAX_INSTANCES, timestampMs),
                filters: p.pose.keypoints.map(() => ({ x: new OneEuroFilter(), y: new OneEuroFilter() })),
                keypoints: null
            };
            this.applyPose(inst, p, timestampMs);
            this.instances.push(inst);
        });

        return this.instances.filter(inst => timestampMs - inst.lastSeen <= RENDER_GRACE_MS);
    }

    // Confident keypoints go through their One Euro filter. A low-confidence keypoint keeps its last filtered
    // position (the raw one if it has none yet) and doesn't touch its filter; its new low score keeps it undrawn.
    applyPose(inst, { pose, bbox }, timestampMs) {
        const t = timestampMs / 1000;
        inst.keypoints = pose.keypoints.map((kp, k) => {
            if (kp.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                const f = inst.filters[k];
                return { x: f.x.filter(kp.x, t), y: f.y.filter(kp.y, t), score: kp.score };
            }
            const prev = inst.keypoints && inst.keypoints[k];
            return { x: prev ? prev.x : kp.x, y: prev ? prev.y : kp.y, score: kp.score };
        });
        inst.bbox = bbox;
        inst.lastSeen = timestampMs;
    }

    // Lowest index in [0, count) that no tracked instance uses for `key` (colorIndex or slot). If all are taken (more
    // tracked instances than indices, i.e. out-of-view instances in their grace period), the lowest index unused by
    // the visible ones, so colours and slots of people on screen stay unique.
    lowestFreeIndex(key, count, timestampMs) {
        const free = (insts) => {
            const used = new Set(insts.map(inst => inst[key]));
            for (let i = 0; i < count; i++) if (!used.has(i)) return i;
            return -1;
        };
        const idx = free(this.instances);
        if (idx !== -1) return idx;
        return Math.max(0, free(this.instances.filter(inst => timestampMs - inst.lastSeen <= CONFIG.TRACKING.RENDER_GRACE_MS)));
    }

    // Bounding box of the confident keypoints: centre and diagonal (for the relative matching distance),
    // or null if no keypoint is confident.
    getBbox(keypoints) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let count = 0;
        for (const kp of keypoints) {
            if (kp.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                minX = Math.min(minX, kp.x);
                maxX = Math.max(maxX, kp.x);
                minY = Math.min(minY, kp.y);
                maxY = Math.max(maxY, kp.y);
                count++;
            }
        }
        if (count === 0) return null;
        return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, diag: Math.hypot(maxX - minX, maxY - minY) };
    }
}
