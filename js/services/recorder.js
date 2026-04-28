export class RecorderService {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
    }

    start(canvasElement, audioStream) {
        this.recordedChunks = [];
        const canvasStream = canvasElement.captureStream(30);
        const tracks = [...canvasStream.getVideoTracks()];
        
        if (audioStream) {
            tracks.push(...audioStream.getAudioTracks());
        }
        
        const combinedStream = new MediaStream(tracks);
        let options = { mimeType: 'video/webm; codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/webm' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'video/mp4' };
        
        this.mediaRecorder = new MediaRecorder(combinedStream, options);
        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) this.recordedChunks.push(e.data);
        };
        this.mediaRecorder.onstop = () => this.exportVideo();
        this.mediaRecorder.start(100);
        this.isRecording = true;
    }

    stop() {
        if (this.isRecording && this.mediaRecorder) {
            this.mediaRecorder.stop();
            this.isRecording = false;
        }
    }

    exportVideo() {
        const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style.display = 'none';
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
        a.download = `neon_dance_${timestamp}.webm`;
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
}
