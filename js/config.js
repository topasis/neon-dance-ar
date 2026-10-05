export const CONFIG = {
    CAMERA: {
        WIDTH: 640,
        HEIGHT: 480,
        FPS: 30,
        MIRROR_FRONT: true    // draw the user-facing camera mirrored (video and skeletons, so recordings too)
    },
    RENDER: {
        GLOW_SCALE: 0.125,    // size of the offscreen glow layer relative to the output canvas
        GLOW_LINE_WIDTH: 12,  // bone width on the glow layer, in output pixels (the halo's width)
        GLOW_ALPHA: 0.3,      // strength of the halo when the glow layer is added onto the frame
        LINE_WIDTH: 3
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
    ],
    // Keypoint name -> index. 0-16 are MoveNet's COCO keypoints; NECK and PELVIS are virtual points (shoulder and
    // hip midpoints) computed by js/logic/rig.js.
    KP: {
        NOSE: 0, L_EYE: 1, R_EYE: 2, L_EAR: 3, R_EAR: 4, L_SHOULDER: 5, R_SHOULDER: 6, L_ELBOW: 7, R_ELBOW: 8,
        L_WRIST: 9, R_WRIST: 10, L_HIP: 11, R_HIP: 12, L_KNEE: 13, R_KNEE: 14, L_ANKLE: 15, R_ANKLE: 16,
        NECK: 17, PELVIS: 18
    },
    // Reference body for looks (add-look-editor design §1): keypoints 0-16 in a 300 x 600 model space, front-facing
    // and unmirrored (the person's left is on the image right). Arms are out in a wide A-pose (wider than the design's
    // starting values) so wires offset from the upper arm and the torso side still anchor to their own bone.
    MODEL_POSE: [
        { x: 150, y: 70 },                       // NOSE
        { x: 162, y: 58 }, { x: 138, y: 58 },    // eyes
        { x: 178, y: 64 }, { x: 122, y: 64 },    // ears
        { x: 195, y: 140 }, { x: 105, y: 140 },  // shoulders
        { x: 245, y: 220 }, { x: 55, y: 220 },   // elbows
        { x: 275, y: 300 }, { x: 25, y: 300 },   // wrists
        { x: 178, y: 310 }, { x: 122, y: 310 },  // hips
        { x: 182, y: 430 }, { x: 118, y: 430 },  // knees
        { x: 185, y: 550 }, { x: 115, y: 550 }   // ankles
    ],
    LOOKS: {
        MODEL_WIDTH: 300,
        MODEL_HEIGHT: 600,
        STORAGE_KEY: 'neonDance.looks.v1',
        JOINT_SNAP: 0.5,           // model units: a point this close to a keypoint anchors to every bone ending there
        MIN_FACING: 0.15,          // |normalised handedness cross| below this (side-on) keeps the previous reflection
        MIN_BONE_SCALE_RATIO: 0.2  // a bone shorter than this x the person's largest bone scale is unusable (side-on
                                   // eyes, a limb pointing at the camera): its items are skipped instead of spinning
        // MAX_PERSONS is set below from TRACKING.MAX_INSTANCES (one look slot per tracked person).
        // Item line width isn't a constant here: items are stroked with the render pass's width (RENDER.LINE_WIDTH /
        // RENDER.GLOW_LINE_WIDTH) so the glow halo keeps working.
    }
};
CONFIG.LOOKS.MAX_PERSONS = CONFIG.TRACKING.MAX_INSTANCES;
