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
            recording: 'off',      // 'off' | 'on' | 'stopping'
            recordingReady: false, // a finished take can be saved / shared
            music: false,
            showCameraFeed: true
        };
        this.lastRecording = null; // { blob, filename } of the last finished take
        this.sharing = false;      // a Save / Share is in progress; further taps are ignored
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
        this.dom.onSaveRecording(() => this.saveRecording());
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
        // A recording never outlives the camera: stop it first so the take can still be saved.
        const wasRecording = this.state.recording === 'on';
        if (wasRecording) this.stopRecording();

        this.loopGeneration++;
        cancelAnimationFrame(this.animationId);
        this.camera.stop();
        this.renderer.clear();
        this.setState({ camera: 'off' });
        this.dom.setStatus(wasRecording ? "Camera stopped. Processing video..." : "Camera stopped.");
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
        if (this.state.recording === 'on') {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }

    startRecording() {
        if (this.state.camera !== 'on' || this.state.recording !== 'off') return;
        try {
            // Set up the audio graph inside the click so the recording always has an audio track: music started
            // later is recorded, and Safari doesn't write an empty MP4 for a video-only stream (WebKit bug 290002).
            this.audio.ensureRouting();
        } catch (err) {
            console.error("Audio setup error:", err);
            this.dom.setStatus("Error: Could not set up audio for recording.");
            return;
        }
        try {
            this.recorder.start(this.dom.canvas, this.audio.getStream());
            this.lastRecording = null;
            this.setState({ recording: 'on', recordingReady: false });
            this.dom.setStatus("Recording...");
        } catch (err) {
            console.error("Recording error:", err);
            this.dom.setStatus("Error: MediaRecorder not supported.");
        }
    }

    async stopRecording() {
        this.setState({ recording: 'stopping' });
        this.dom.setStatus("Recording stopped. Processing video...");
        try {
            this.lastRecording = await this.recorder.stop();
            this.setState({ recording: 'off', recordingReady: true });
            this.dom.setStatus("Recording ready. Tap Save / Share.");
        } catch (err) {
            console.error("Recording error:", err);
            this.setState({ recording: 'off' });
            this.dom.setStatus("Error: Recording failed.");
        }
    }

    // Runs on its own tap: navigator.share() needs a fresh user gesture.
    async saveRecording() {
        if (!this.lastRecording || this.sharing) return;
        this.sharing = true;
        try {
            await this.recorder.save(this.lastRecording);
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                this.dom.setStatus("Tap Save / Share again to share the video.");
            } else if (err.name !== 'AbortError' && err.name !== 'InvalidStateError') {
                console.error("Save error:", err);
                this.dom.setStatus("Error: Could not save the video.");
            }
        } finally {
            this.sharing = false;
        }
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
