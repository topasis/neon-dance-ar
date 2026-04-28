export class OneEuroFilter {
    constructor(minCutoff = 1.0, beta = 0.1, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.xPrev = null;
        this.dxPrev = null;
        this.tPrev = null;
    }

    alpha(cutoff, dt) {
        const tau = 1.0 / (2 * Math.PI * cutoff);
        return 1.0 / (1.0 + tau / dt);
    }

    filter(x, t) {
        if (this.tPrev === null) {
            this.xPrev = x;
            this.dxPrev = 0.0;
            this.tPrev = t;
            return x;
        }

        const dt = t - this.tPrev;
        if (dt <= 0) return x;

        const dx = (x - this.xPrev) / dt;
        const alphaD = this.alpha(this.dCutoff, dt);
        const dxHat = alphaD * dx + (1.0 - alphaD) * this.dxPrev;

        const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
        const alpha = this.alpha(cutoff, dt);
        const xHat = alpha * x + (1.0 - alpha) * this.xPrev;

        this.xPrev = xHat;
        this.dxPrev = dxHat;
        this.tPrev = t;

        return xHat;
    }
}
