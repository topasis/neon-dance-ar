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
        // drawFn(ctx, instance, color, points), called once per instance after bones and joints, in both passes.
        this.decorators = [];

        // Offscreen glow layer at CONFIG.RENDER.GLOW_SCALE of the output size; sized in resize().
        this.glowCanvas = document.createElement('canvas');
        this.glowCtx = this.glowCanvas.getContext('2d');
        this.glowStyle = { glow: true, lineWidth: CONFIG.RENDER.GLOW_LINE_WIDTH, jointRadius: CONFIG.RENDER.GLOW_LINE_WIDTH / 2 };
        this.crispStyle = { glow: false, lineWidth: CONFIG.RENDER.LINE_WIDTH, jointRadius: CONFIG.RENDER.JOINT_RADIUS };
        this.resizeGlow();
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

    // Decorators draw in canvas pixels with the pass's colour and line width set (thick on the glow layer, thin in the
    // crisp pass); any ctx state they change is restored after each call.
    addDecorator(drawFn) {
        this.decorators.push(drawFn);
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.resizeGlow();
    }

    resizeGlow() {
        this.glowCanvas.width = Math.max(1, Math.round(this.canvas.width * CONFIG.RENDER.GLOW_SCALE));
        this.glowCanvas.height = Math.max(1, Math.round(this.canvas.height * CONFIG.RENDER.GLOW_SCALE));
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
        if (trackedInstances.length === 0) return;
        const frame = trackedInstances.map(inst => ({
            inst,
            color: CONFIG.NEON_COLORS[inst.colorIndex],
            points: inst.keypoints.map(kp => this.mapping.mapPoint(kp.x, kp.y))
        }));
        this.renderGlowPass(ctx => this.drawSkeletons(ctx, frame, this.glowStyle));
        this.renderCrispPass(ctx => this.drawSkeletons(ctx, frame, this.crispStyle));
    }

    // Glow: drawFn(ctx) draws in canvas pixels onto the small offscreen canvas (a scale transform shrinks it,
    // line widths included); the result is upscaled additively onto the main canvas, where smoothing turns it into
    // a soft halo. One blur-like upscale per frame, whatever the number of people.
    renderGlowPass(drawFn) {
        const g = this.glowCtx;
        g.save();
        try {
            g.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
            g.setTransform(this.glowCanvas.width / this.canvas.width, 0, 0,
                this.glowCanvas.height / this.canvas.height, 0, 0);
            g.globalCompositeOperation = 'lighter';
            drawFn(g);
        } finally {
            g.restore();
        }

        this.ctx.save();
        try {
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.globalAlpha = CONFIG.RENDER.GLOW_ALPHA;
            this.ctx.imageSmoothingEnabled = true;
            this.ctx.imageSmoothingQuality = 'high';
            this.ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);
        } finally {
            this.ctx.restore();
        }
    }

    // Crisp core lines on top of the glow, additively; save/restore resets the blend state even if drawing throws.
    renderCrispPass(drawFn) {
        this.ctx.save();
        try {
            this.ctx.globalCompositeOperation = 'lighter';
            drawFn(this.ctx);
        } finally {
            this.ctx.restore();
        }
    }

    // Bones, joints (or landmark overrides, crisp pass only) and decorators of every instance, onto ctx.
    drawSkeletons(ctx, frame, style) {
        for (const { inst, color, points } of frame) {
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = style.lineWidth;

            for (const [i, j] of CONFIG.CONNECTIONS) {
                const kp1 = inst.keypoints[i];
                const kp2 = inst.keypoints[j];
                if (kp1.score > CONFIG.TRACKING.MIN_CONFIDENCE && kp2.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                    ctx.beginPath();
                    ctx.moveTo(points[i].x, points[i].y);
                    ctx.lineTo(points[j].x, points[j].y);
                    ctx.stroke();
                }
            }

            inst.keypoints.forEach((kp, k) => {
                if (kp.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                    const override = this.landmarkOverrides.get(k);
                    if (override) {
                        // Assets are drawn crisp only; the glow pass leaves no blurred dot under them.
                        if (style.glow) return;
                        ctx.save();
                        try {
                            ctx.translate(points[k].x, points[k].y);
                            override(ctx, { x: points[k].x, y: points[k].y, score: kp.score }, inst, color, points);
                        } finally {
                            ctx.restore();
                        }
                    } else {
                        ctx.beginPath();
                        ctx.arc(points[k].x, points[k].y, style.jointRadius, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
            });

            for (const decorate of this.decorators) {
                ctx.save();
                try {
                    decorate(ctx, inst, color, points);
                } finally {
                    ctx.restore();
                }
            }
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
