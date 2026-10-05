import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BONE_NAMES, identityMatrixFor } from '../js/logic/rig.js';
import {
    PRESETS, ITEM_TYPES, SHAPE_TYPES, bindItem, copyLook, createItem, drawLook, sanitizeLook, tracePath
} from '../js/ui/looks.js';

// Records path calls with the current transform applied (translate/rotate/scale/transform; save/restore).
function fakeCtx() {
    const ops = [];
    let m = [1, 0, 0, 1, 0, 0];
    const stack = [];
    const mul = (n) => {
        m = [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    };
    const pt = (x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
    return {
        ops,
        save() { stack.push(m); },
        restore() { m = stack.pop(); },
        transform(a, b, c, d, e, f) { mul([a, b, c, d, e, f]); },
        translate(x, y) { mul([1, 0, 0, 1, x, y]); },
        rotate(r) { mul([Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); },
        scale(x, y) { mul([x, 0, 0, y, 0, 0]); },
        beginPath() { ops.push({ op: 'beginPath' }); },
        moveTo(x, y) { ops.push({ op: 'moveTo', ...pt(x, y) }); },
        lineTo(x, y) { ops.push({ op: 'lineTo', ...pt(x, y) }); },
        arc(x, y, r) { ops.push({ op: 'arc', ...pt(x, y), r }); },
        rect(x, y) { ops.push({ op: 'rect', ...pt(x, y) }); },
        closePath() { ops.push({ op: 'closePath' }); },
        stroke() { ops.push({ op: 'stroke', color: this.strokeStyle, lineWidth: this.lineWidth }); }
    };
}

const STYLE = { lineWidth: 7, glow: false };
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

test('presets use only known item types and valid bones, colours and ids', () => {
    for (const [key, look] of Object.entries(PRESETS)) {
        assert.ok(look.name && look.items.length > 0, key);
        assert.equal(new Set(look.items.map(i => i.id)).size, look.items.length, `${key}: unique ids`);
        for (const item of look.items) {
            assert.ok(ITEM_TYPES.includes(item.type), `${key}: ${item.type}`);
            assert.ok(item.color === null || COLOR_RE.test(item.color), `${key}: colour ${item.color}`);
            if (item.type === 'stroke') {
                assert.ok(item.points.length >= 2, `${key}: stroke points`);
                assert.equal(item._bones.length, item.points.length);
                item._bones.forEach(b => assert.ok(BONE_NAMES.includes(b), `${key}: bone ${b}`));
            } else {
                assert.ok(BONE_NAMES.includes(item._bone), `${key}: bone ${item._bone}`);
                assert.ok(item.scale > 0);
            }
        }
    }
});

test('generated sticks and wires anchor every point to the bone they follow', () => {
    for (const key of ['glowSticks', 'elSuit']) {
        for (const item of PRESETS[key].items.filter(i => i.type === 'stroke')) {
            assert.equal(new Set(item._bones).size, 1, `${key}: ${item._bones}`);
        }
    }
});

test('presets survive a save/load round trip unchanged', () => {
    for (const look of Object.values(PRESETS)) {
        const json = JSON.parse(JSON.stringify(look, (k, v) => (k.startsWith('_') ? undefined : v)));
        assert.deepEqual(sanitizeLook(json), copyLook(look));
    }
});

test('bindItem anchors shapes and each stroke point, and re-anchors after a move', () => {
    const glasses = createItem('glasses', { x: 150, y: 58 });
    assert.equal(glasses._bone, 'EYES');
    glasses.x = 182; glasses.y = 450;
    assert.equal(bindItem(glasses)._bone, 'L_SHIN');
    const arm = createItem('stroke', { points: [{ x: 210, y: 170 }, { x: 245, y: 220 }, { x: 265, y: 280 }] });
    assert.deepEqual(arm._bones, ['L_UPPER', 'L_UPPER', 'L_FORE']);
});

test('copyLook gives an independent copy; editing it leaves the preset unchanged', () => {
    const before = JSON.stringify(PRESETS.party);
    const copy = copyLook(PRESETS.party);
    copy.items[4].points[0].x = 0;
    copy.items[0].scale = 3;
    copy.items.pop();
    assert.equal(JSON.stringify(PRESETS.party), before);
});

test('drawLook strokes with the pass line width and person colour, one stroke per colour run', () => {
    const ctx = fakeCtx();
    drawLook(ctx, PRESETS.classic, identityMatrixFor, '#00FFFF', STYLE);
    const strokes = ctx.ops.filter(o => o.op === 'stroke');
    assert.deepEqual(strokes, [{ op: 'stroke', color: '#00FFFF', lineWidth: 7 }]);

    const ctx2 = fakeCtx();
    drawLook(ctx2, PRESETS.glowSticks, identityMatrixFor, '#00FFFF', STYLE);
    assert.equal(ctx2.ops.filter(o => o.op === 'stroke').length, PRESETS.glowSticks.items.length);
});

test('items on an unusable bone are skipped; strokes break where a point is unusable', () => {
    const look = {
        name: 't', items: [
            createItem('circle', { x: 182, y: 480 }), // L_SHIN
            createItem('circle', { x: 150, y: 205 }), // SPINE
            createItem('stroke', { points: [{ x: 210, y: 170 }, { x: 245, y: 220 }, { x: 265, y: 280 }, { x: 275, y: 300 }] })
        ]
    };
    const dead = new Set(['L_SHIN', 'L_UPPER']);
    const ctx = fakeCtx();
    drawLook(ctx, look, name => (dead.has(name) ? null : [1, 0, 0, 1, 0, 0]), '#FF00FF', STYLE);
    const arcs = ctx.ops.filter(o => o.op === 'arc');
    assert.equal(arcs.length, 1);
    assert.equal(arcs[0].y, 205);
    const lines = ctx.ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo').slice(-2);
    assert.deepEqual(lines.map(o => [o.op, o.x, o.y]), [['moveTo', 265, 280], ['lineTo', 275, 300]]);
});

test('a shape is placed by bone matrix, then position, rotation and scale', () => {
    const ctx = fakeCtx();
    const item = createItem('line', { x: 150, y: 205, scale: 2, rotation: Math.PI / 2 }); // SPINE
    drawLook(ctx, { name: 't', items: [item] }, () => [1, 0, 0, 1, 10, 20], '#FFFFFF', STYLE);
    const [a, b] = ctx.ops.filter(o => o.op === 'moveTo' || o.op === 'lineTo');
    // base line (-25, 0)-(25, 0), scaled 2, rotated 90deg -> (0, -50)-(0, 50), at (150, 205), then +(10, 20)
    assert.ok(Math.abs(a.x - 160) < 1e-9 && Math.abs(a.y - 175) < 1e-9);
    assert.ok(Math.abs(b.x - 160) < 1e-9 && Math.abs(b.y - 275) < 1e-9);
});

test('every shape path starts a new subpath', () => {
    for (const type of SHAPE_TYPES) {
        const ctx = fakeCtx();
        tracePath(ctx, { type });
        assert.ok(['moveTo', 'rect'].includes(ctx.ops[0]?.op), type);
    }
});

test('sanitizeLook drops invalid items and fills defaults', () => {
    const look = sanitizeLook({
        name: 'x', items: [
            { type: 'circle', x: 150, y: 205, color: 'red' },
            { type: 'unicorn', x: 1, y: 1 },
            { type: 'stroke', points: [{ x: 1, y: 2 }] },
            null,
            { type: 'hat', x: 150, y: 30, scale: -1, rotation: 'a', color: '#ABCDEF' }
        ]
    });
    assert.equal(look.items.length, 2);
    assert.equal(look.items[0].color, null);
    assert.equal(look.items[1].scale, 1);
    assert.equal(look.items[1].rotation, 0);
    assert.equal(look.items[1].color, '#ABCDEF');
    assert.equal(sanitizeLook({ items: 'nope' }), null);
    assert.equal(sanitizeLook(null), null);
});
