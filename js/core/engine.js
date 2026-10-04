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

        // Single source of truth for app state; the UI is rendered from it via dom.render().
        this.state = {
            model: 'loading',      // 'loading' | 'ready' | 'error'
            camera: 'off',         // 'off' | 'starting' | 'on'
            recording: false,
            music: false,
            showCameraFeed: true
        };
        this.animationId = null;
        // Incremented whenever the render loop is started or stopped; a frame from an older generation is discarded.
        this.loopGeneration = 0;

        this.bindEvents();
        this.dom.render(this.state);
    }

    setState(changes) {
        Object.assign(this.state, changes);
        this.dom.render(this.state);
    }

    async start() {
        try {
            await this.detector.init((msg) => this.dom.setStatus(msg));
            this.setState({ model: 'ready' });
        } catch (err) {
            console.error("Model load error:", err);
            this.setState({ model: 'error' });
            this.dom.setStatus("Error: Failed to load pose model.");
        }
    }

    bindEvents() {
        this.dom.onCameraToggle(() => this.toggleCamera());
        this.dom.onBackgroundToggle(() => this.toggleBackground());
        this.dom.onMusicToggle(() => this.toggleMusic());
        this.dom.onRecordToggle(() => this.toggleRecording());
    }

    async toggleCamera() {
        if (this.state.model !== 'ready' || this.state.camera === 'starting') return;

        if (this.state.camera === 'on') {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }

    async startCamera() {
        this.setState({ camera: 'starting' });
        try {
            this.dom.setStatus("Requesting camera access...");
            const dimensions = await this.camera.start();
            this.renderer.resize(dimensions.width, dimensions.height);

            this.setState({ camera: 'on' });
            this.dom.setStatus("Running pose estimation...");
            this.loopGeneration++;
            this.renderLoop(this.loopGeneration);
        } catch (err) {
            console.error("Camera error:", err);
            this.camera.stop();
            this.setState({ camera: 'off' });
            this.dom.setStatus("Error: Camera access denied.");
        }
    }

    stopCamera() {
        // A recording never outlives the camera: stop it first so the file is still exported.
        const wasRecording = this.state.recording;
        if (wasRecording) this.stopRecording();

        this.loopGeneration++;
        cancelAnimationFrame(this.animationId);
        this.camera.stop();
        this.renderer.clear();
        this.setState({ camera: 'off' });
        this.dom.setStatus(wasRecording ? "Camera stopped. Recording saved." : "Camera stopped.");
    }

    toggleBackground() {
        this.setState({ showCameraFeed: !this.state.showCameraFeed });
    }

    async toggleMusic() {
        try {
            const isPlaying = await this.audio.toggle();
            this.setState({ music: isPlaying });
        } catch (err) {
            this.dom.setStatus("Error playing music. Check assets/music.mp3.");
        }
    }

    toggleRecording() {
        if (this.state.recording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        if (this.state.camera !== 'on') return;
        try {
            const audioStream = this.state.music ? this.audio.getStream() : null;
            this.recorder.start(this.dom.canvas, audioStream);
            this.setState({ recording: true });
            this.dom.setStatus("Recording...");
        } catch (err) {
            this.dom.setStatus("Error: MediaRecorder not supported.");
        }
    }

    stopRecording() {
        this.recorder.stop();
        this.setState({ recording: false });
        this.dom.setStatus("Recording stopped. Processing video...");
    }

    async renderLoop(generation) {
        if (generation !== this.loopGeneration) return;

        let poses = await this.detector.estimatePoses(this.dom.video);
        // The camera was stopped (or restarted) while inference was in flight: drop this frame.
        if (generation !== this.loopGeneration) return;

        poses = poses.filter(p => p.score > CONFIG.TRACKING.MIN_INSTANCE_SCORE);
        poses.sort((a, b) => b.score - a.score);
        if (poses.length > CONFIG.TRACKING.MAX_INSTANCES) {
            poses = poses.slice(0, CONFIG.TRACKING.MAX_INSTANCES);
        }

        const trackedInstances = this.tracker.update(poses);

        this.renderer.renderBackground(this.dom.video, this.state.showCameraFeed);
        this.renderer.renderSkeletons(trackedInstances);

        this.animationId = requestAnimationFrame(() => this.renderLoop(generation));
    }
}
