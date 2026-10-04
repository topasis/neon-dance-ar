// The single mapping from video (model) pixel coordinates to canvas pixel coordinates.
// Keypoints are mapped point by point (rather than drawing under a canvas transform) so that line widths, joint
// radii and Phase 3 assets stay in plain canvas pixels and aren't stretched or flipped, and so that consumers
// (landmark overrides, the glow pass, reflection checks) receive coordinates exactly as they appear on screen.
export class CoordinateMapping {
    constructor() {
        this.scaleX = 1;
        this.scaleY = 1;
        this.mirrored = false;
        this.canvasWidth = 0;
    }

    // Scales the video frame to fill the canvas, then optionally flips it horizontally.
    // A video without dimensions yet (no metadata) maps 1:1.
    update(videoWidth, videoHeight, canvasWidth, canvasHeight, mirrored) {
        this.scaleX = videoWidth ? canvasWidth / videoWidth : 1;
        this.scaleY = videoHeight ? canvasHeight / videoHeight : 1;
        this.mirrored = mirrored;
        this.canvasWidth = canvasWidth;
    }

    mapPoint(x, y) {
        const cx = x * this.scaleX;
        return {
            x: this.mirrored ? this.canvasWidth - cx : cx,
            y: y * this.scaleY
        };
    }
}
