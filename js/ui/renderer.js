import { CONFIG } from '../config.js';
import { CoordinateMapping } from '../logic/coords.js';

export class Renderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        // Video -> canvas mapping, refreshed by updateMapping() each frame; every keypoint is drawn through it.
        this.mapping = new CoordinateMapping();
        // Only the user-facing camera exists for now; Phase 2's camera switch updates this.
        this.facingMode = 'user';
        // Extension points (Phase 3 assets, decorations). Both receive canvas-mapped coordinates and the ctx to draw on.
        // keypoint index -> drawFn(ctx, keypoint, instance, color, points); drawn instead of that joint's circle.
        this.landmarkOverrides = new Map();
        // drawFn(ctx, instance, color, points), called once per instance after bones and joints.
        this.decorators = [];
    }

    // drawFn runs with ctx translated to the keypoint's canvas position, so it draws around (0, 0). keypoint is
    // { x, y, score } in canvas pixels; points holds every keypoint of the instance in canvas pixels (e.g. for a
    // tilt angle from a reference pair); instance is the tracked instance (its own keypoints are in video pixels).
    setLandmarkOverride(index, drawFn) {
        this.landmarkOverrides.set(index, drawFn);
    }

    clearLandmarkOverride(index) {
        this.landmarkOverrides.delete(index);
    }

    // Decorators draw in canvas pixels with the instance's glow style set; any ctx state they change is restored after each call.
    addDecorator(drawFn) {
        this.decorators.push(drawFn);
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    // Call once per frame before any drawing: everything drawn from keypoints uses this mapping.
    updateMapping(videoElement) {
        const mirrored = CONFIG.CAMERA.MIRROR_FRONT && this.facingMode === 'user';
        this.mapping.update(videoElement.videoWidth, videoElement.videoHeight,
            this.canvas.width, this.canvas.height, mirrored);
    }

    renderBackground(videoElement, showCameraFeed) {
        if (showCameraFeed && videoElement.srcObject) {
            // drawImage scales the frame to the canvas like the mapping does; the flip matches mapPoint().
            this.ctx.save();
            try {
                if (this.mapping.mirrored) {
                    this.ctx.translate(this.canvas.width, 0);
                    this.ctx.scale(-1, 1);
                }
                this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
            } finally {
                this.ctx.restore();
            }
        } else {
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    renderSkeletons(trackedInstances) {
        // save/restore resets the glow and blend state even if drawing throws partway through.
        this.ctx.save();
        try {
            for (const inst of trackedInstances) {
                const color = CONFIG.NEON_COLORS[inst.colorIndex];
                const points = inst.keypoints.map(kp => this.mapping.mapPoint(kp.x, kp.y));

                this.ctx.shadowBlur = CONFIG.RENDER.GLOW_BLUR;
                this.ctx.shadowColor = color;
                this.ctx.globalCompositeOperation = "lighter";
                this.ctx.strokeStyle = color;
                this.ctx.fillStyle = color;
                this.ctx.lineWidth = CONFIG.RENDER.LINE_WIDTH;

                for (const [i, j] of CONFIG.CONNECTIONS) {
                    const kp1 = inst.keypoints[i];
                    const kp2 = inst.keypoints[j];
                    if (kp1.score > CONFIG.TRACKING.MIN_CONFIDENCE && kp2.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                        this.ctx.beginPath();
                        this.ctx.moveTo(points[i].x, points[i].y);
                        this.ctx.lineTo(points[j].x, points[j].y);
                        this.ctx.stroke();
                    }
                }

                inst.keypoints.forEach((kp, k) => {
                    if (kp.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                        const override = this.landmarkOverrides.get(k);
                        if (override) {
                            this.ctx.save();
                            try {
                                this.ctx.translate(points[k].x, points[k].y);
                                override(this.ctx, { x: points[k].x, y: points[k].y, score: kp.score }, inst, color, points);
                            } finally {
                                this.ctx.restore();
                            }
                        } else {
                            this.ctx.beginPath();
                            this.ctx.arc(points[k].x, points[k].y, CONFIG.RENDER.JOINT_RADIUS, 0, 2 * Math.PI);
                            this.ctx.fill();
                        }
                    }
                });

                for (const decorate of this.decorators) {
                    this.ctx.save();
                    try {
                        decorate(this.ctx, inst, color, points);
                    } finally {
                        this.ctx.restore();
                    }
                }
            }
        } finally {
            this.ctx.restore();
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Decorator: a circle around the face, centred on the nose with the eye distance as radius.
// instance.keypoints carry the scores; points are the same keypoints mapped to canvas coordinates.
export function drawFaceCircle(ctx, instance, color, points) {
    const [nose, leftEye, rightEye] = instance.keypoints;

    if (nose && leftEye && rightEye &&
        nose.score > CONFIG.TRACKING.MIN_CONFIDENCE &&
        leftEye.score > CONFIG.TRACKING.MIN_CONFIDENCE &&
        rightEye.score > CONFIG.TRACKING.MIN_CONFIDENCE) {

        const dx = points[1].x - points[2].x;
        const dy = points[1].y - points[2].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, distance, 0, 2 * Math.PI);
        ctx.stroke();
    }
}
