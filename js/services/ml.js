import { CONFIG } from '../config.js';

const WEBGPU_BACKEND_SRC = 'vendor/tf-backend-webgpu.min.js';

export class PoseDetector {
    constructor() {
        this.detector = null;
    }

    async init(onStatusUpdate) {
        await this.initBackend(onStatusUpdate);

        onStatusUpdate("Loading MoveNet MultiPose model...");
        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            {
                modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
                modelUrl: 'models/movenet-multipose-lightning/model.json',
                multiPoseMaxDimension: CONFIG.MODEL.MAX_DIMENSION
            }
        );
        onStatusUpdate("Model loaded. Ready to start camera.");
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
    // Errors from the model propagate to the caller.
    async estimatePoses(videoElement) {
        if (!this.detector || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return [];

        const poses = await this.detector.estimatePoses(videoElement);
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
