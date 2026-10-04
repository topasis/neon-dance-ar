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
        this.statusMessage = this.statusText.innerText;
        this.statsMessage = '';
    }

    setStatus(text) {
        this.statusMessage = text;
        this.renderStatus();
    }

    // Loop rates shown after the status message; '' hides them.
    setStats(text) {
        this.statsMessage = text;
        this.renderStatus();
    }

    renderStatus() {
        this.statusText.innerText = this.statsMessage
            ? `${this.statusMessage} | ${this.statsMessage}`
            : this.statusMessage;
    }

    // Sets every button's label, active styling and enabled flag from the engine state.
    render(state) {
        const cameraOn = state.camera === 'on';
        this.btnCamera.innerText = cameraOn ? "Stop Camera" : "Start Camera";
        this.btnCamera.classList.toggle('active', cameraOn);
        this.btnCamera.disabled = state.model !== 'ready' || state.camera === 'starting';

        this.btnBackground.innerText = `Background: ${state.showCameraFeed ? 'Live' : 'Black'}`;
        this.btnBackground.classList.toggle('active', !state.showCameraFeed);

        this.btnMusic.innerText = state.music ? "Stop Music" : "Play Music";
        this.btnMusic.classList.toggle('active', state.music);

        this.btnRecord.innerText = state.recording ? "Stop Recording" : "Start Recording";
        this.btnRecord.classList.toggle('recording', state.recording);
        this.btnRecord.disabled = !cameraOn;
    }

    onCameraToggle(callback) { this.btnCamera.addEventListener('click', callback); }
    onBackgroundToggle(callback) { this.btnBackground.addEventListener('click', callback); }
    onMusicToggle(callback) { this.btnMusic.addEventListener('click', callback); }
    onRecordToggle(callback) { this.btnRecord.addEventListener('click', callback); }
}
