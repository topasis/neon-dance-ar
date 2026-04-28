export const CONFIG = {
    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FPS: 30
    },
    RENDER: {
        GLOW_BLUR: 15,
        LINE_WIDTH: 3,
        JOINT_RADIUS: 4
    },
    TRACKING: {
        MIN_CONFIDENCE: 0.3,
        MIN_INSTANCE_SCORE: 0.2,
        MAX_INSTANCES: 5,
        MAX_DISTANCE_PX: 100,
        GRACE_PERIOD_FRAMES: 30
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
