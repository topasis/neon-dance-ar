import { CONFIG } from '../config.js';

const WEBGPU_BACKEND_SRC = 'vendor/tf-backend-webgpu.min.js';
// A reset that isn't followed by a successful estimate counts as a failed recovery.
const MAX_RESETS_WITHOUT_SUCCESS = 1;

export class PoseDetector {
    constructor() {
        this.detector = null;
        this.consecutiveFailures = 0; // estimatePoses() errors since the last success
        this.resetsSinceSuccess = 0;
        this.needsReload = false;     // a reset failed: reload() before the next use
        this.contextLost = false;     // the WebGL backend's GPU context was lost (common on mobile)
    }

    async init(onStatusUpdate) {
        await this.initBackend(onStatusUpdate);

        onStatusUpdate("Loading MoveNet MultiPose model...");
        await this.loadModel();
        onStatusUpdate("Model loaded. Ready to start camera.");
    }

    async loadModel() {
        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                modelUrl: 'models/movenet-multipose-lightning/model.json',
                multiPoseMaxDimension: CONFIG.MODEL.MAX_DIMENSION,
                // The library's default (0.25) would drop poses before our own MIN_INSTANCE_SCORE filter sees them.
                minPoseScore: CONFIG.TRACKING.MIN_INSTANCE_SCORE,
                // Both default to true for MultiPose; InstanceTracker and its One Euro filters do this instead.
                enableSmoothing: false,
                enableTracking: false
            }
        );
        // A lost context makes every later estimate fail (or silently return nothing): fail fast so reset() runs.
        // WebGPU device loss (opt-in backend) isn't detected; only the consecutive-failure reset covers it.
        this.contextLost = false;
        const canvas = tf.getBackend() === 'webgl' ? tf.backend().canvas : null;
        if (canvas) canvas.addEventListener('webglcontextlost', () => { this.contextLost = true; }, { once: true });
    }

    // Runtime recovery: re-creates the backend and model (see recreate()). Rejects if that fails, or if the
    // previous reset wasn't followed by a successful estimate; either way needsReload is then set.
    async reset() {
        if (this.resetsSinceSuccess >= MAX_RESETS_WITHOUT_SUCCESS) {
            this.needsReload = true;
            throw new Error("Pose detection still failing after a reset");
        }
        this.resetsSinceSuccess++;
        try {
            await this.recreate();
        } catch (err) {
            this.needsReload = true;
            throw err;
        }
    }

    // Retry after a failed reset (on the next camera start): re-creates the backend and model unconditionally.
    async reload() {
        this.resetsSinceSuccess = 0;
        await this.recreate();
        this.needsReload = false;
    }

    // Disposes the detector and re-creates the TF.js backend and model; a lost GPU context can't be reused.
    async recreate() {
        this.consecutiveFailures = 0;

        const detector = this.detector;
        this.detector = null;
        try {
            detector?.dispose();
        } catch (err) {
            console.warn("Detector dispose failed:", err);
        }

        const backend = tf.getBackend();
        const factory = tf.findBackendFactory(backend);
        tf.removeBackend(backend);
        tf.registerBackend(backend, factory);
        if (!(await tf.setBackend(backend))) throw new Error(`tf.setBackend('${backend}') returned false`);
        await tf.ready();
        await this.loadModel();
    }

    // Uses CONFIG.MODEL.BACKEND; anything other than WebGL falls back to WebGL if it fails to initialise.
    async initBackend(onStatusUpdate) {
        if (CONFIG.MODEL.BACKEND === 'webgpu') {
            try {
                onStatusUpdate("Initializing TensorFlow.js WebGPU backend...");
                await loadScript(WEBGPU_BACKEND_SRC);
                if (!(await tf.setBackend('webgpu'))) throw new Error("tf.setBackend('webgpu') returned false");
                await tf.ready();
                return;
            } catch (err) {
                console.warn("WebGPU backend unavailable, falling back to WebGL:", err);
            }
        }

        onStatusUpdate("Initializing TensorFlow.js WebGL backend...");
        if (!(await tf.setBackend('webgl'))) throw new Error("tf.setBackend('webgl') returned false");
        await tf.ready();
    }

    // Returns ready-to-track poses: score above the threshold, highest score first, at most MAX_INSTANCES.
    // Errors from the model propagate to the caller and are counted in consecutiveFailures.
    async estimatePoses(videoElement) {
        if (!this.detector || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return [];

        let poses;
        try {
            if (this.contextLost) throw new Error("WebGL context lost");
            poses = await this.detector.estimatePoses(videoElement);
        } catch (err) {
            this.consecutiveFailures++;
            throw err;
        }
        this.consecutiveFailures = 0;
        this.resetsSinceSuccess = 0;
        return poses
            .filter(p => p.score > CONFIG.TRACKING.MIN_INSTANCE_SCORE)
            .sort((a, b) => b.score - a.score)
            .slice(0, CONFIG.TRACKING.MAX_INSTANCES);
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });
}
