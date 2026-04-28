export class PoseDetector {
    constructor() {
        this.detector = null;
    }

    async init(onStatusUpdate) {
        onStatusUpdate("Initializing TensorFlow.js WebGL backend...");
        await tf.setBackend('webgl');
        await tf.ready();

        onStatusUpdate("Loading MoveNet MultiPose model...");
        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING }
        );
        onStatusUpdate("Model loaded. Ready to start camera.");
    }

    async estimatePoses(videoElement) {
        if (!this.detector) return [];
        try {
            return await this.detector.estimatePoses(videoElement);
        } catch (e) {
            console.error("Inference error:", e);
            return [];
        }
    }
}
