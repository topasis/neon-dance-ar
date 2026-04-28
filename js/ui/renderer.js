import { CONFIG } from '../config.js';

export class Renderer {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
    }

    resize(width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
    }

    renderBackground(videoElement, showCameraFeed) {
        if (showCameraFeed && videoElement.srcObject) {
            this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    renderSkeletons(trackedInstances) {
        for (const inst of trackedInstances) {
            const color = CONFIG.NEON_COLORS[inst.colorIndex];

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
                    this.ctx.moveTo(kp1.x, kp1.y);
                    this.ctx.lineTo(kp2.x, kp2.y);
                    this.ctx.stroke();
                }
            }

            for (const kp of inst.keypoints) {
                if (kp.score > CONFIG.TRACKING.MIN_CONFIDENCE) {
                    this.ctx.beginPath();
                    this.ctx.arc(kp.x, kp.y, CONFIG.RENDER.JOINT_RADIUS, 0, 2 * Math.PI);
                    this.ctx.fill();
                }
            }

            this.renderCircleAroundFace(inst);
        }

        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.shadowBlur = 0;
    }

    renderCircleAroundFace(inst) {
        const nose = inst.keypoints[0];
        const leftEye = inst.keypoints[1];
        const rightEye = inst.keypoints[2];

        if (nose && leftEye && rightEye &&
            nose.score > CONFIG.TRACKING.MIN_CONFIDENCE &&
            leftEye.score > CONFIG.TRACKING.MIN_CONFIDENCE &&
            rightEye.score > CONFIG.TRACKING.MIN_CONFIDENCE) {

            const dx = leftEye.x - rightEye.x;
            const dy = leftEye.y - rightEye.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            this.ctx.beginPath();
            this.ctx.arc(nose.x, nose.y, distance, 0, 2 * Math.PI);
            this.ctx.stroke();
        }
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
}
