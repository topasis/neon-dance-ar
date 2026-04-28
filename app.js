// Constants
const NEON_COLORS = [
    '#00FFFF', // Cyan
    '#FF00FF', // Magenta
    '#00FF00', // Green
    '#FFA500', // Orange
    '#FFFF00', // Yellow
    '#FF0000', // Red
    '#0000FF', // Blue
    '#FFFFFF'  // White
];

const CONNECTIONS = [
    [0, 1], [0, 2],           // Nose to eyes
    [1, 3], [2, 4],           // Eyes to ears
    [5, 6],                   // Shoulders
    [5, 7], [7, 9],           // Left arm
    [6, 8], [8, 10],          // Right arm
    [5, 11], [6, 12],         // Torso
    [11, 12],                 // Hips
    [11, 13], [13, 15],       // Left leg
    [12, 14], [14, 16],       // Right leg
];

// One Euro Filter Implementation
class OneEuroFilter {
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

// Instance Tracker for Identity
class InstanceTracker {
    constructor() {
        this.instances = []; // { id, bboxCenter, filters: [], colorIndex, age }
        this.nextId = 0;
        this.maxDistance = 100; // pixels
    }

    update(detectedPoses) {
        const t = performance.now() / 1000;
        const matched = new Array(detectedPoses.length).fill(false);
        const newInstances = [];

        // Try to match existing instances to new detections
        for (let i = 0; i < this.instances.length; i++) {
            const inst = this.instances[i];
            let bestDist = Infinity;
            let bestIdx = -1;

            for (let j = 0; j < detectedPoses.length; j++) {
                if (matched[j]) continue;
                const pose = detectedPoses[j];
                const center = this.getBboxCenter(pose.keypoints);
                const dist = Math.hypot(center.x - inst.bboxCenter.x, center.y - inst.bboxCenter.y);
                if (dist < bestDist && dist < this.maxDistance) {
                    bestDist = dist;
                    bestIdx = j;
                }
            }

            if (bestIdx !== -1) {
                matched[bestIdx] = true;
                const pose = detectedPoses[bestIdx];
                inst.bboxCenter = this.getBboxCenter(pose.keypoints);
                inst.age = 0;
                
                // Update filters and store filtered keypoints
                inst.keypoints = pose.keypoints.map((kp, kIdx) => {
                    return {
                        x: inst.filters[kIdx].x.filter(kp.x, t),
                        y: inst.filters[kIdx].y.filter(kp.y, t),
                        score: kp.score
                    };
                });
                newInstances.push(inst);
            } else {
                inst.age++;
                if (inst.age < 5) { // Keep alive for a few frames
                    newInstances.push(inst);
                }
            }
        }

        // Create new instances for unmatched detections
        for (let j = 0; j < detectedPoses.length; j++) {
            if (!matched[j]) {
                const pose = detectedPoses[j];
                const filters = Array(17).fill(0).map(() => ({
                    x: new OneEuroFilter(),
                    y: new OneEuroFilter()
                }));
                
                const keypoints = pose.keypoints.map((kp, kIdx) => {
                    return {
                        x: filters[kIdx].x.filter(kp.x, t),
                        y: filters[kIdx].y.filter(kp.y, t),
                        score: kp.score
                    };
                });

                newInstances.push({
                    id: this.nextId++,
                    bboxCenter: this.getBboxCenter(pose.keypoints),
                    filters: filters,
                    colorIndex: this.nextId % NEON_COLORS.length,
                    age: 0,
                    keypoints: keypoints
                });
            }
        }

        this.instances = newInstances;
        return this.instances;
    }

    getBboxCenter(keypoints) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let count = 0;
        for (const kp of keypoints) {
            if (kp.score > 0.3) {
                minX = Math.min(minX, kp.x);
                maxX = Math.max(maxX, kp.x);
                minY = Math.min(minY, kp.y);
                maxY = Math.max(maxY, kp.y);
                count++;
            }
        }
        if (count === 0) return { x: 0, y: 0 };
        return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
}

// App State
let detector;
let video;
let canvas;
let ctx;
let showCameraFeed = true;
let isPlayingMusic = false;
let isRecording = false;
let mediaRecorder;
let recordedChunks = [];
let tracker = new InstanceTracker();
let animationId;
let audioContext;
let audioDestination;
let audioSource;

// DOM Elements
const btnCamera = document.getElementById('btn-camera');
const btnBackground = document.getElementById('btn-background');
const btnMusic = document.getElementById('btn-music');
const btnRecord = document.getElementById('btn-record');
const statusText = document.getElementById('status');
const audioEl = document.getElementById('bg-music');

async function init() {
    video = document.getElementById('video');
    canvas = document.getElementById('output-canvas');
    ctx = canvas.getContext('2d');

    statusText.innerText = "Initializing TensorFlow.js WebGL backend...";
    await tf.setBackend('webgl');
    await tf.ready();

    statusText.innerText = "Loading MoveNet MultiPose model...";
    detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING }
    );

    statusText.innerText = "Model loaded. Ready to start camera.";
    
    // Setup event listeners
    btnCamera.addEventListener('click', toggleCamera);
    btnBackground.addEventListener('click', toggleBackground);
    btnMusic.addEventListener('click', toggleMusic);
    btnRecord.addEventListener('click', toggleRecording);
}

async function toggleCamera() {
    if (video.srcObject) {
        // Stop
        const stream = video.srcObject;
        stream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        cancelAnimationFrame(animationId);
        btnCamera.innerText = "Start Camera";
        btnCamera.classList.remove('active');
        btnRecord.disabled = true;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        statusText.innerText = "Camera stopped.";
    } else {
        // Start
        try {
            statusText.innerText = "Requesting camera access...";
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, facingMode: 'user' } 
            });
            video.srcObject = stream;
            
            video.onloadedmetadata = () => {
                video.play();
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                btnCamera.innerText = "Stop Camera";
                btnCamera.classList.add('active');
                btnRecord.disabled = false;
                statusText.innerText = "Running pose estimation...";
                
                // Start render loop
                renderLoop();
            };
        } catch (err) {
            console.error("Error accessing camera:", err);
            statusText.innerText = "Error: Camera access denied or not available.";
        }
    }
}

function toggleBackground() {
    showCameraFeed = !showCameraFeed;
    btnBackground.innerText = `Background: ${showCameraFeed ? 'Live' : 'Black'}`;
    if (!showCameraFeed) {
        btnBackground.classList.add('active');
    } else {
        btnBackground.classList.remove('active');
    }
}

function toggleMusic() {
    if (isPlayingMusic) {
        audioEl.pause();
        audioEl.currentTime = 0;
        isPlayingMusic = false;
        btnMusic.innerText = "Play Music";
        btnMusic.classList.remove('active');
    } else {
        // Setup Web Audio API context for recording mix if needed
        setupAudioRouting();
        audioEl.play().then(() => {
            isPlayingMusic = true;
            btnMusic.innerText = "Stop Music";
            btnMusic.classList.add('active');
        }).catch(err => {
            console.error("Error playing audio:", err);
            statusText.innerText = "Error playing music. Check if assets/music.mp3 exists.";
        });
    }
}

function setupAudioRouting() {
    if (!audioContext) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContext = new AudioContext();
        audioSource = audioContext.createMediaElementSource(audioEl);
        audioDestination = audioContext.createMediaStreamDestination();
        
        // Connect to destination (for recording) and to hardware destination (to hear it)
        audioSource.connect(audioDestination);
        audioSource.connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

function toggleRecording() {
    if (isRecording) {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        btnRecord.innerText = "Start Recording";
        btnRecord.classList.remove('recording');
        statusText.innerText = "Recording stopped. Processing video...";
    } else {
        // Start recording
        recordedChunks = [];
        
        // Get canvas stream
        const canvasStream = canvas.captureStream(30);
        
        // Combine with audio if playing
        const tracks = [...canvasStream.getVideoTracks()];
        if (isPlayingMusic && audioDestination) {
            tracks.push(...audioDestination.stream.getAudioTracks());
        }
        
        const combinedStream = new MediaStream(tracks);
        
        try {
            // Prefer WebM for browser recording
            let options = { mimeType: 'video/webm; codecs=vp9' };
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'video/webm' };
            }
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                options = { mimeType: 'video/mp4' };
            }
            
            mediaRecorder = new MediaRecorder(combinedStream, options);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                document.body.appendChild(a);
                a.style = 'display: none';
                a.href = url;
                const timestamp = new Date().toISOString().replace(/[:.-]/g, '');
                a.download = `neon_dance_${timestamp}.webm`;
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                statusText.innerText = "Video downloaded.";
            };
            
            mediaRecorder.start(100); // collect 100ms chunks
            isRecording = true;
            btnRecord.innerText = "Stop Recording";
            btnRecord.classList.add('recording');
            statusText.innerText = "Recording...";
        } catch (err) {
            console.error("Error starting recording:", err);
            statusText.innerText = "Error: MediaRecorder not supported or failed.";
        }
    }
}

async function renderLoop() {
    if (!video.srcObject) return;

    // 1. Run Inference
    let poses = [];
    try {
        poses = await detector.estimatePoses(video);
    } catch (e) {
        console.error("Inference error:", e);
    }

    // Filter and sort instances
    poses = poses.filter(p => p.score > 0.2);
    poses.sort((a, b) => b.score - a.score);
    if (poses.length > 5) poses = poses.slice(0, 5);

    // 2. Temporal Smoothing & Tracking
    const trackedInstances = tracker.update(poses);

    // 3. Background Render
    if (showCameraFeed) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 4. Skeleton Render
    for (const inst of trackedInstances) {
        if (inst.age > 0) continue; // Only draw active frames
        
        const color = NEON_COLORS[inst.colorIndex];
        
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;

        // Draw connections
        for (const [i, j] of CONNECTIONS) {
            const kp1 = inst.keypoints[i];
            const kp2 = inst.keypoints[j];
            if (kp1.score > 0.3 && kp2.score > 0.3) {
                ctx.beginPath();
                ctx.moveTo(kp1.x, kp1.y);
                ctx.lineTo(kp2.x, kp2.y);
                ctx.stroke();
            }
        }

        // Draw joints
        for (const kp of inst.keypoints) {
            if (kp.score > 0.3) {
                ctx.beginPath();
                ctx.arc(kp.x, kp.y, 4, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    // Reset composite for next frame background draw
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowBlur = 0;

    animationId = requestAnimationFrame(renderLoop);
}

// Start initialization when page loads
window.addEventListener('DOMContentLoaded', init);
