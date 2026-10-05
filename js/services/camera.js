import { CONFIG } from '../config.js';

export class CameraService {
    constructor(videoElement, width, height) {
        this.video = videoElement;
        this.width = width;
        this.height = height;
        // Called when the live camera track ends (another app took the camera, permission revoked, unplugged).
        this.onEnded = null;
        // Incremented by every start() and stop(); a start() that sees a newer value has been cancelled.
        this.generation = 0;
    }

    // Resolves with the video size once the video is playing. Rejects with the getUserMedia() / play() error
    // (its `name` says why), a 'TimeoutError' if no metadata arrives in time, or an 'AbortError' if stop() ran
    // first. On rejection the stream is already stopped.
    async start() {
        const generation = ++this.generation;
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: this.width, height: this.height, facingMode: 'user' }
        });
        if (generation !== this.generation) {
            stopTracks(stream);
            throw new DOMException("Camera start cancelled.", 'AbortError');
        }

        this.video.srcObject = stream;
        for (const track of stream.getVideoTracks()) {
            track.addEventListener('ended', () => {
                if (this.video.srcObject === stream && this.onEnded) this.onEnded();
            });
        }

        try {
            await waitForMetadata(this.video, CONFIG.LIFECYCLE.METADATA_TIMEOUT_MS);
            await this.video.play();
        } catch (err) {
            if (generation === this.generation) this.stop();
            throw err;
        }
        if (generation !== this.generation) throw new DOMException("Camera start cancelled.", 'AbortError');

        return {
            width: this.video.videoWidth,
            height: this.video.videoHeight
        };
    }

    // Safe in any state; also cancels a start() in progress.
    stop() {
        this.generation++;
        if (this.video.srcObject) {
            stopTracks(this.video.srcObject);
            this.video.srcObject = null;
        }
    }

    // True while the camera stream still has a live video track.
    isLive() {
        const stream = this.video.srcObject;
        return !!stream && stream.getVideoTracks().some(track => track.readyState === 'live');
    }
}

function stopTracks(stream) {
    stream.getTracks().forEach(track => track.stop());
}

function waitForMetadata(video, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            video.removeEventListener('loadedmetadata', onLoaded);
            reject(new DOMException("Camera video did not load in time.", 'TimeoutError'));
        }, timeoutMs);
        const onLoaded = () => {
            clearTimeout(timer);
            resolve();
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
    });
}
