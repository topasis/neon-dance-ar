import { CONFIG } from '../config.js';

// MP4 first: it's what iOS (< 18.4 records nothing else), phone galleries and social apps handle best.
const MIME_TYPES = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm'
];
const EXTENSIONS = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
// Keep the object URL alive long enough for the browser to start the download.
const REVOKE_DELAY_MS = 60000;

export class RecorderService {
    constructor() {
        this.mediaRecorder = null;
        this.isRecording = false;
        this.stopped = null;
    }

    start(canvasElement, audioStream) {
        const canvasStream = canvasElement.captureStream(CONFIG.CAMERA.FPS);
        const tracks = [...canvasStream.getVideoTracks()];

        if (audioStream) {
            tracks.push(...audioStream.getAudioTracks());
        }

        const combinedStream = new MediaStream(tracks);
        const mimeType = MIME_TYPES.find(type => MediaRecorder.isTypeSupported(type));
        const mediaRecorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
        // Chunks are per recording so a late chunk of a previous take can't end up in the next one.
        const chunks = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };
        this.stopped = new Promise((resolve, reject) => {
            mediaRecorder.onstop = () => {
                const type = mediaRecorder.mimeType || mimeType || 'video/webm';
                const blob = new Blob(chunks, { type });
                if (blob.size === 0) {
                    reject(new Error("Recording is empty."));
                    return;
                }
                const extension = EXTENSIONS[type.split(';')[0].trim()] || 'webm';
                const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
                resolve({ blob, filename: `neon_dance_${timestamp}.${extension}` });
            };
        });
        mediaRecorder.start(100);
        this.mediaRecorder = mediaRecorder;
        this.isRecording = true;
    }

    // Resolves to { blob, filename } once the recorder has flushed its last chunk.
    stop() {
        if (this.isRecording && this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
        return this.stopped || Promise.reject(new Error("Nothing was recorded."));
    }

    // Opens the share sheet (iOS: "Save Video" to Photos, or straight to TikTok) where files can be shared,
    // otherwise downloads the file. Must be called from a user gesture.
    async save({ blob, filename }) {
        // Plain container type (no codecs parameter) so share targets recognise the file.
        const file = new File([blob], filename, { type: blob.type.split(';')[0] });
        if (navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({ files: [file] });
                return;
            } catch (err) {
                // The user closed the share sheet: nothing to do.
                if (err.name === 'AbortError') return;
                console.warn("Share failed, downloading instead:", err);
            }
        }
        this.download(blob, filename);
    }

    download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    }
}
