export class AudioService {
    constructor(audioElement) {
        this.audioEl = audioElement;
        this.isPlaying = false;
        this.audioContext = null;
        this.audioSource = null;
        this.audioDestination = null;
    }

    setupRouting() {
        if (!this.audioContext) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.audioSource = this.audioContext.createMediaElementSource(this.audioEl);
            this.audioDestination = this.audioContext.createMediaStreamDestination();
            
            this.audioSource.connect(this.audioDestination);
            this.audioSource.connect(this.audioContext.destination);
        }
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    async toggle() {
        if (this.isPlaying) {
            this.audioEl.pause();
            this.audioEl.currentTime = 0;
            this.isPlaying = false;
        } else {
            this.setupRouting();
            await this.audioEl.play();
            this.isPlaying = true;
        }
        return this.isPlaying;
    }

    getStream() {
        return this.audioDestination ? this.audioDestination.stream : null;
    }
}
