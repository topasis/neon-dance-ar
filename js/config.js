export const CONFIG = {
    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FPS: 30,
        MIRROR_FRONT: true    // draw the user-facing camera mirrored (video and skeletons, so recordings too)
    },
    RENDER: {
        GLOW_BLUR: 15,
        LINE_WIDTH: 3,
        JOINT_RADIUS: 4
    },
    MODEL: {
        MAX_DIMENSION: 256,   // MoveNet multiPoseMaxDimension; must be a multiple of 32
        BACKEND: 'webgl',     // 'webgl' (default) or 'webgpu' (opt-in, falls back to WebGL on failure)
        MAX_CONSECUTIVE_FAILURES: 5 // failed estimates in a row before the detector is disposed and re-initialised
    },
    TRACKING: {
        MIN_CONFIDENCE: 0.3,
        MIN_INSTANCE_SCORE: 0.2,
        MAX_INSTANCES: 5,
        MAX_DISTANCE_RATIO: 0.5, // max bbox-centre movement between estimates, relative to the person's bbox diagonal
        MIN_MATCH_DIAG_PX: 40,   // floor for that diagonal (video px), so a pose with 1-2 confident keypoints can re-match
        GRACE_PERIOD_MS: 1000,   // an unseen person can still be re-matched (same ID and colour) for this long
        RENDER_GRACE_MS: 150     // ...but is only drawn for this long; hides a missed estimate without frozen ghosts
    },
    LIFECYCLE: {
        METADATA_TIMEOUT_MS: 5000,      // camera start fails if the video has no metadata by then
        UNMUTE_TIMEOUT_MS: 3000,        // on return from the background, a still-muted camera track counts as dead after this
        RECORDER_STOP_TIMEOUT_MS: 5000  // a recording whose MediaRecorder never fires 'stop' fails after this
    },
    NEON_COLORS: [
        '#00FFFF', '#FF00FF', '#00FF00', '#FFA500', 
        '#FFFF00', '#FF0000', '#0000FF', '#FFFFFF'
    ],
    CONNECTIONS: [
        [0, 1], [0, 2],           // Nose to eyes
        [1, 3], [2, 4],           // Eyes to ears
        [5, 6],                   // Shoulders
        [5, 7], [7, 9],           // Left arm
        [6, 8], [8, 10],          // Right arm
        [5, 11], [6, 12],         // Torso
        [11, 12],                 // Hips
        [11, 13], [13, 15],       // Left leg
        [12, 14], [14, 16],       // Right leg
    ]
};
