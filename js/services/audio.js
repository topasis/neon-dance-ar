export class AudioService {
    constructor(audioElement) {
        this.audioEl = audioElement;
        this.isPlaying = false;
        // The play() promise of a tap that hasn't started the music yet; cleared when a later tap cancels it.
        this.pendingPlay = null;
        this.audioContext = null;
        this.audioSource = null;
        this.audioDestination = null;
    }

    // Idempotent. Call from a user gesture (Play Music or Start Recording) so the AudioContext may start.
    ensureRouting() {
        if (!this.audioContext) {
            // Keep music audible when the iPhone silent switch is on (Safari 16.4+).
            if (navigator.audioSession) navigator.audioSession.type = 'playback';

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();
            const audioSource = audioContext.createMediaElementSource(this.audioEl);
            const audioDestination = audioContext.createMediaStreamDestination();

            audioSource.connect(audioDestination);
            audioSource.connect(audioContext.destination);
            // Assigned only once the whole graph is built, so a failed build is retried on the next tap.
            this.audioContext = audioContext;
            this.audioSource = audioSource;
            this.audioDestination = audioDestination;
        }
        // 'suspended', or 'interrupted' on iOS after a call or another app took the audio.
        if (this.audioContext.state !== 'running') {
            this.audioContext.resume().catch(() => {});
        }
    }

    async toggle() {
        if (this.isPlaying || this.pendingPlay) {
            // Also cancels a play() still in flight, so a quick second tap stops the music.
            this.pendingPlay = null;
            this.audioEl.pause();
            this.audioEl.currentTime = 0;
            this.isPlaying = false;
            return this.isPlaying;
        }

        this.ensureRouting();
        const play = this.pendingPlay = this.audioEl.play();
        try {
            await play;
        } catch (err) {
            // Cancelled by a later tap (pause() rejects the pending play()): not an error.
            if (this.pendingPlay !== play) return this.isPlaying;
            this.pendingPlay = null;
            throw err;
        }
        if (this.pendingPlay !== play) return this.isPlaying;
        this.pendingPlay = null;
        this.isPlaying = true;
        return this.isPlaying;
    }

    getStream() {
        return this.audioDestination ? this.audioDestination.stream : null;
    }
}
