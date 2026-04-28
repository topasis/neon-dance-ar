export class DOMManager {
    constructor() {
        this.btnCamera = document.getElementById('btn-camera');
        this.btnBackground = document.getElementById('btn-background');
        this.btnMusic = document.getElementById('btn-music');
        this.btnRecord = document.getElementById('btn-record');
        this.statusText = document.getElementById('status');
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('output-canvas');
        this.audioEl = document.getElementById('bg-music');
    }

    setStatus(text) {
        this.statusText.innerText = text;
    }

    setCameraActive(isActive) {
        if (isActive) {
            this.btnCamera.innerText = "Stop Camera";
            this.btnCamera.classList.add('active');
            this.btnRecord.disabled = false;
        } else {
            this.btnCamera.innerText = "Start Camera";
            this.btnCamera.classList.remove('active');
            this.btnRecord.disabled = true;
        }
    }

    setBackgroundLive(isLive) {
        this.btnBackground.innerText = `Background: ${isLive ? 'Live' : 'Black'}`;
        if (!isLive) this.btnBackground.classList.add('active');
        else this.btnBackground.classList.remove('active');
    }

    setMusicPlaying(isPlaying) {
        if (isPlaying) {
            this.btnMusic.innerText = "Stop Music";
            this.btnMusic.classList.add('active');
        } else {
            this.btnMusic.innerText = "Play Music";
            this.btnMusic.classList.remove('active');
        }
    }

    setRecordingActive(isRecording) {
        if (isRecording) {
            this.btnRecord.innerText = "Stop Recording";
            this.btnRecord.classList.add('recording');
        } else {
            this.btnRecord.innerText = "Start Recording";
            this.btnRecord.classList.remove('recording');
        }
    }

    onCameraToggle(callback) { this.btnCamera.addEventListener('click', callback); }
    onBackgroundToggle(callback) { this.btnBackground.addEventListener('click', callback); }
    onMusicToggle(callback) { this.btnMusic.addEventListener('click', callback); }
    onRecordToggle(callback) { this.btnRecord.addEventListener('click', callback); }
}
