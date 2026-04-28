import { AppEngine } from './js/core/engine.js';

window.addEventListener('DOMContentLoaded', async () => {
    const engine = new AppEngine();
    await engine.start();
});
