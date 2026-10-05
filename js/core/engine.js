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
        // Incremented whenever the loops are started or stopped; work from an older generation is discarded.
        this.loopGeneration = 0;
        // Latest tracked instances written by the inference loop and drawn by the render loop.
        this.latestInstances = [];
        // Settles when the in-flight estimate (if any) finishes, so a restarted inference loop never overlaps it.
        this.estimateSettled = Promise.resolve();
        this.loopStats = null;
        // Last reported error per loop ('Render' / 'Inference'); cleared when that loop succeeds again.
        this.loopErrors = {};
        // Status message shown before a loop error replaced it, restored once all loops recover.
        this.statusBeforeError = null;

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
            this.startLoops();
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

        this.stopLoops();
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

    startLoops() {
        this.loopGeneration++;
        this.latestInstances = [];
        this.tracker.reset(); // people and filter state from a previous session must not match new people
        this.loopErrors = {};
        this.statusBeforeError = null;
        this.loopStats = { shownAt: performance.now(), render: newRate(), inference: newRate() };
        this.renderLoop(this.loopGeneration);
        this.inferenceLoop(this.loopGeneration);
    }

    stopLoops() {
        this.loopGeneration++;
        cancelAnimationFrame(this.animationId);
        this.latestInstances = [];
        this.dom.setStats('');
    }

    // Draws every animation frame with the latest tracked instances; never waits for inference.
    renderLoop(generation) {
        if (generation !== this.loopGeneration) return;

        try {
            this.renderer.updateMapping(this.dom.video);
            this.renderer.renderBackground(this.dom.video, this.state.showCameraFeed);
            this.renderer.renderSkeletons(this.latestInstances);
            tickRate(this.loopStats.render);
            this.clearLoopError('Render');
            this.updateLoopStats();
        } catch (err) {
            this.reportLoopError('Render', err);
        }

        this.animationId = requestAnimationFrame(() => this.renderLoop(generation));
    }

    // Runs one estimate at a time. Before the next one it waits for a camera frame newer than the one just
    // estimated (so the same frame isn't estimated twice) and always yields a macrotask: on WebGL an estimate can
    // resolve without ever yielding to the event loop, which would otherwise freeze the page.
    async inferenceLoop(generation) {
        await this.estimateSettled;
        const video = this.dom.video;

        while (generation === this.loopGeneration) {
            if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                await Promise.all([nextVideoFrame(video), yieldToEventLoop()]);
                continue;
            }

            // Poses describe the frame at the time the estimate started, not when it resolves.
            const t = performance.now();
            // Armed before the estimate, so a frame that arrives while it runs counts as "new".
            const newFrame = nextVideoFrame(video);
            const estimate = this.detector.estimatePoses(video);
            this.estimateSettled = estimate.then(() => {}, () => {});
            try {
                const poses = await estimate;
                // The camera was stopped (or restarted) while inference was in flight: drop the result.
                if (generation !== this.loopGeneration) return;
                this.latestInstances = this.tracker.update(poses, t);
                tickRate(this.loopStats.inference);
                this.clearLoopError('Inference');
            } catch (err) {
                if (generation !== this.loopGeneration) return;
                // Falls through to the frame wait below, so a persistent failure retries at most once per camera frame.
                this.reportLoopError('Inference', err);
            }
            await Promise.all([newFrame, yieldToEventLoop()]);
        }
    }

    // Refreshes the render FPS / inference Hz readout at most twice per second.
    updateLoopStats() {
        const now = performance.now();
        if (now - this.loopStats.shownAt < 500) return;
        this.loopStats.shownAt = now;
        const fps = Math.round(rateOf(this.loopStats.render, now));
        const hz = Math.round(rateOf(this.loopStats.inference, now));
        this.dom.setStats(`Render ${fps} FPS · Inference ${hz} Hz`);
    }

    // Keeps the loops alive on errors; logs and surfaces each distinct error once instead of every frame.
    reportLoopError(loopName, err) {
        const key = String(err && err.message);
        if (this.loopErrors[loopName] === key) return;
        if (!this.hasLoopError()) this.statusBeforeError = this.dom.statusMessage;
        this.loopErrors[loopName] = key;
        console.error(`${loopName} loop error:`, err);
        this.dom.setStatus(`Error in ${loopName.toLowerCase()} loop (see console).`);
    }

    // Called on each success; once every loop has recovered, restores the status the error replaced
    // (unless something else has set the status since). A later repeat of the same error is logged again.
    clearLoopError(loopName) {
        if (!this.loopErrors[loopName]) return;
        const errorStatus = this.dom.statusMessage;
        delete this.loopErrors[loopName];
        if (this.hasLoopError()) return;
        if (errorStatus.startsWith('Error in ') && this.statusBeforeError !== null) {
            this.dom.setStatus(this.statusBeforeError);
        }
        this.statusBeforeError = null;
    }

    hasLoopError() {
        return Object.keys(this.loopErrors).length > 0;
    }
}

// Upper bound on waiting for a camera frame, so the loop can't hang if frames stop (camera stopped, track ended).
const VIDEO_FRAME_TIMEOUT_MS = 50; // ~1.5 frames at 30 FPS; bounds the wait if requestVideoFrameCallback never fires (e.g. hidden <video>).

// Resolves in a new macrotask (MessageChannel avoids setTimeout's minimum-delay clamping).
function yieldToEventLoop() {
    return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => {
            channel.port1.close();
            resolve();
        };
        channel.port2.postMessage(null);
    });
}

// Resolves on the next presented camera frame (requestVideoFrameCallback), or after VIDEO_FRAME_TIMEOUT_MS,
// whichever comes first. Without requestVideoFrameCallback it resolves at once (the caller still yields).
function nextVideoFrame(video) {
    if (!video.requestVideoFrameCallback) return Promise.resolve();
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            video.cancelVideoFrameCallback(handle);
            resolve();
        }, VIDEO_FRAME_TIMEOUT_MS);
        const handle = video.requestVideoFrameCallback(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

// Event-rate meter: exponential moving average of the interval between events.
function newRate() {
    return { last: 0, avgInterval: 0 };
}

function tickRate(rate) {
    const now = performance.now();
    if (rate.last) {
        const dt = now - rate.last;
        rate.avgInterval = rate.avgInterval ? rate.avgInterval * 0.9 + dt * 0.1 : dt;
    }
    rate.last = now;
}

// Events per second; decays toward 0 when events stop.
function rateOf(rate, now) {
    if (!rate.avgInterval) return 0;
    return 1000 / Math.max(rate.avgInterval, now - rate.last);
}
