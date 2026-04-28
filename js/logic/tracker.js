import { OneEuroFilter } from './filters.js';
import { CONFIG } from '../config.js';

export class InstanceTracker {
    constructor() {
        this.instances = [];
        this.nextId = 0;
    }

    update(detectedPoses) {
        const t = performance.now() / 1000;
        const matched = new Array(detectedPoses.length).fill(false);
        const newInstances = [];

        for (let i = 0; i < this.instances.length; i++) {
            const inst = this.instances[i];
            let bestDist = Infinity;
            let bestIdx = -1;

            for (let j = 0; j < detectedPoses.length; j++) {
                if (matched[j]) continue;
                const pose = detectedPoses[j];
                const center = this.getBboxCenter(pose.keypoints);
                const dist = Math.hypot(center.x - inst.bboxCenter.x, center.y - inst.bboxCenter.y);
                if (dist < bestDist && dist < CONFIG.TRACKING.MAX_DISTANCE_PX) {
                    bestDist = dist;
                    bestIdx = j;
                }
            }

            if (bestIdx !== -1) {
                matched[bestIdx] = true;
                const pose = detectedPoses[bestIdx];
                inst.bboxCenter = this.getBboxCenter(pose.keypoints);
                inst.age = 0;
                
                inst.keypoints = pose.keypoints.map((kp, kIdx) => ({
                    x: inst.filters[kIdx].x.filter(kp.x, t),
                    y: inst.filters[kIdx].y.filter(kp.y, t),
                    score: kp.score
                }));
                newInstances.push(inst);
            } else {
                inst.age++;
                if (inst.age < CONFIG.TRACKING.GRACE_PERIOD_FRAMES) {
                    newInstances.push(inst);
                }
            }
        }

        for (let j = 0; j < detectedPoses.length; j++) {
            if (!matched[j]) {
                const pose = detectedPoses[j];
                const filters = Array(17).fill(0).map(() => ({
                    x: new OneEuroFilter(),
                    y: new OneEuroFilter()
                }));
                
                const keypoints = pose.keypoints.map((kp, kIdx) => ({
                    x: filters[kIdx].x.filter(kp.x, t),
                    y: filters[kIdx].y.filter(kp.y, t),
                    score: kp.score
                }));

                newInstances.push({
                    id: this.nextId++,
                    bboxCenter: this.getBboxCenter(pose.keypoints),
                    filters: filters,
                    colorIndex: this.nextId % CONFIG.NEON_COLORS.length,
                    age: 0,
                    keypoints: keypoints
                });
            }
        }

        this.instances = newInstances;
        return this.instances;
    }

    getBboxCenter(keypoints) {
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
        if (count === 0) return { x: 0, y: 0 };
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
}
