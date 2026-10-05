import { CONFIG } from '../config.js';
import { CoordinateMapping } from '../logic/coords.js';
import { Rig } from '../logic/rig.js';
import { drawLook, PRESETS } from './looks.js';

export class Renderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        // Video -> canvas mapping, refreshed by updateMapping() each frame; every keypoint is drawn through it.
        this.mapping = new CoordinateMapping();
        // Only the user-facing camera exists for now; Phase 2's camera switch updates this.
        this.facingMode = 'user';
        // Per-person looks by slot (Look or null = PRESETS.classic); the engine passes its array via setLooks().
        this.persons = new Array(CONFIG.LOOKS.MAX_PERSONS).fill(null);
        // Per-frame data of each person drawn, pooled: { inst, color, look, points, rig }.
        this.people = [];
        this.peopleCount = 0;
        // inst.id -> { rig, inst, frame }: one Rig per tracked instance, kept across frames (its reflection state needs
        // consecutive frames of the same person) and dropped at the next frame that doesn't draw the instance.
        this.rigs = new Map();
        this.frameNo = 0;
        // Extension point for Phase 3 image assets, until an `image` item type replaces it.
        // keypoint index -> drawFn(ctx, keypoint, instance, color, points); drawn crisp-only on top of the look.
        this.landmarkOverrides = new Map();

        // Offscreen glow layer at CONFIG.RENDER.GLOW_SCALE of the output size; sized in resize().
        this.glowCanvas = document.createElement('canvas');
        this.glowCtx = this.glowCanvas.getContext('2d');
        this.glowStyle = { glow: true, lineWidth: CONFIG.RENDER.GLOW_LINE_WIDTH };
        this.crispStyle = { glow: false, lineWidth: CONFIG.RENDER.LINE_WIDTH };
        this.resizeGlow();
    }

    // persons: array of CONFIG.LOOKS.MAX_PERSONS entries (Look or null), read every frame; the editor replaces
    // entries in place, so changes show up live without calling this again.
    setLooks(persons) {
        this.persons = persons;
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

    // Draws every instance with its slot's look (the default look, Classic, when the slot has none). Each person's
    // rig is updated once per frame from the canvas-mapped points and shared by both passes.
    renderSkeletons(trackedInstances) {
        const n = trackedInstances.length;
        const frameNo = ++this.frameNo;
        for (let i = 0; i < n; i++) {
            const inst = trackedInstances[i];
            let entry = this.rigs.get(inst.id);
            // A different object under a known id: the tracker was reset (ids restart), so it's a new person.
            if (!entry) {
                this.rigs.set(inst.id, entry = { rig: new Rig(), inst, frame: 0 });
            } else if (entry.inst !== inst) {
                entry.inst = inst;
                entry.rig.reset();
            }
            entry.frame = frameNo;
            const person = this.people[i] ??= { inst: null, color: null, look: null, points: null, rig: null };
            person.inst = inst;
            person.color = CONFIG.NEON_COLORS[inst.colorIndex];
            person.look = this.persons[inst.slot] ?? PRESETS.classic;
            person.points = inst.keypoints.map(kp => this.mapping.mapPoint(kp.x, kp.y));
            // Until the person's facing is known, a mirrored canvas means a reflected (front-facing) body.
            person.rig = entry.rig.update(person.points, inst.keypoints, this.mapping.mirrored);
        }
        if (this.rigs.size > n) {
            for (const [id, entry] of this.rigs) if (entry.frame !== frameNo) this.rigs.delete(id);
        }
        this.peopleCount = n;
        if (n === 0) return;
        this.renderGlowPass(ctx => this.drawPeople(ctx, this.glowStyle));
        this.renderCrispPass(ctx => this.drawPeople(ctx, this.crispStyle));
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

    // Each person's look onto ctx with the pass's style, then (crisp pass only) any landmark overrides on top.
    drawPeople(ctx, style) {
        for (let i = 0; i < this.peopleCount; i++) {
            const { inst, color, look, points, rig } = this.people[i];
            drawLook(ctx, look, rig.matrixFor, color, style);
            // Assets are drawn crisp only, so the glow pass leaves no blurred halo under them.
            if (!style.glow && this.landmarkOverrides.size > 0) this.drawOverrides(ctx, inst, color, points, style);
        }
    }

    drawOverrides(ctx, inst, color, points, style) {
        inst.keypoints.forEach((kp, k) => {
            const override = this.landmarkOverrides.get(k);
            if (!override || kp.score <= CONFIG.TRACKING.MIN_CONFIDENCE) return;
            ctx.save();
            try {
                ctx.strokeStyle = color;
                ctx.fillStyle = color;
                ctx.lineWidth = style.lineWidth;
                ctx.translate(points[k].x, points[k].y);
                override(ctx, { x: points[k].x, y: points[k].y, score: kp.score }, inst, color, points);
            } finally {
                ctx.restore();
            }
        });
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
