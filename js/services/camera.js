export class CameraService {
    constructor(videoElement, width, height) {
        this.video = videoElement;
        this.width = width;
        this.height = height;
    }

    async start() {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: this.width, height: this.height, facingMode: 'user' } 
        });
        this.video.srcObject = stream;
        
        return new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                this.video.play();
                resolve({
                    width: this.video.videoWidth,
                    height: this.video.videoHeight
                });
            };
        });
    }

    stop() {
        if (this.video.srcObject) {
            const stream = this.video.srcObject;
            stream.getTracks().forEach(track => track.stop());
            this.video.srcObject = null;
        }
    }
    
    get isPlaying() {
        return this.video.srcObject !== null;
    }
}
