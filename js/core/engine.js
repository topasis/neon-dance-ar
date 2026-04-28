import { CONFIG } from '../config.js';
import { DOMManager } from '../ui/dom.js';
import { Renderer } from '../ui/renderer.js';
import { PoseDetector } from '../services/ml.js';
import { CameraService } from '../services/camera.js';
import { AudioService } from '../services/audio.js';
import { RecorderService } from '../services/recorder.js';
import { InstanceTracker } from '../logic/tracker.js';

export class AppEngine {
    constructor() {
        this.dom = new DOMManager();
        this.renderer = new Renderer(this.dom.canvas);
        this.detector = new PoseDetector();
        this.camera = new CameraService(this.dom.video, CONFIG.CAMERA.WIDTH, CONFIG.CAMERA.HEIGHT);
        this.audio = new AudioService(this.dom.audioEl);
        this.recorder = new RecorderService();
        this.tracker = new InstanceTracker();

        this.showCameraFeed = true;
        this.animationId = null;

        this.bindEvents();
    }

    async start() {
        await this.detector.init((msg) => this.dom.setStatus(msg));
    }

    bindEvents() {
        this.dom.onCameraToggle(() => this.toggleCamera());
        this.dom.onBackgroundToggle(() => this.toggleBackground());
        this.dom.onMusicToggle(() => this.toggleMusic());
        this.dom.onRecordToggle(() => this.toggleRecording());
    }

    async toggleCamera() {
        if (this.camera.isPlaying) {
            this.camera.stop();
            cancelAnimationFrame(this.animationId);
            this.renderer.clear();
            this.dom.setCameraActive(false);
            this.dom.setStatus("Camera stopped.");
        } else {
            try {
                this.dom.setStatus("Requesting camera access...");
                const dimensions = await this.camera.start();
                this.renderer.resize(dimensions.width, dimensions.height);
                
                this.dom.setCameraActive(true);
                this.dom.setStatus("Running pose estimation...");
                this.renderLoop();
            } catch (err) {
                console.error("Camera error:", err);
                this.dom.setStatus("Error: Camera access denied.");
            }
        }
    }

    toggleBackground() {
        this.showCameraFeed = !this.showCameraFeed;
        this.dom.setBackgroundLive(this.showCameraFeed);
    }

    async toggleMusic() {
        try {
            const isPlaying = await this.audio.toggle();
            this.dom.setMusicPlaying(isPlaying);
        } catch (err) {
            this.dom.setStatus("Error playing music. Check assets/music.mp3.");
        }
    }

    toggleRecording() {
        if (this.recorder.isRecording) {
            this.recorder.stop();
            this.dom.setRecordingActive(false);
            this.dom.setStatus("Recording stopped. Processing video...");
        } else {
            try {
                const audioStream = this.audio.isPlaying ? this.audio.getStream() : null;
                this.recorder.start(this.dom.canvas, audioStream);
                this.dom.setRecordingActive(true);
                this.dom.setStatus("Recording...");
            } catch (err) {
                this.dom.setStatus("Error: MediaRecorder not supported.");
            }
        }
    }

    async renderLoop() {
        if (!this.camera.isPlaying) return;

        let poses = await this.detector.estimatePoses(this.dom.video);
        
        poses = poses.filter(p => p.score > CONFIG.TRACKING.MIN_INSTANCE_SCORE);
        poses.sort((a, b) => b.score - a.score);
        if (poses.length > CONFIG.TRACKING.MAX_INSTANCES) {
            poses = poses.slice(0, CONFIG.TRACKING.MAX_INSTANCES);
        }

        const trackedInstances = this.tracker.update(poses);

        this.renderer.renderBackground(this.dom.video, this.showCameraFeed);
        this.renderer.renderSkeletons(trackedInstances);

        this.animationId = requestAnimationFrame(() => this.renderLoop());
    }
}
