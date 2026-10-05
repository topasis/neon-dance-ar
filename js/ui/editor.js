// Body look editor (add-look-editor design §8): a modal <dialog> showing the model pose, where the user places shapes,
// draws freehand strokes and edits the items of each person slot's look. Edits change the shared `persons` array in
// place (the live renderer reads the same array) and are saved after every change.
//
// API
//   new LookEditor(root, persons)   root = the #editor <dialog>; persons = the engine's slot looks (Look | null each)
//   editor.open() / editor.close()
//   editor.onClose                  called after the dialog closed (Done or Escape)
import { CONFIG } from '../config.js';
import { MODEL_POINTS, identityMatrixFor } from '../logic/rig.js';
import { BASE_RADIUS, PRESETS, SHAPE_TYPES, bindItem, copyLook, createItem, drawLook } from './looks.js';
import { save } from '../services/storage.js';

const { MODEL_WIDTH: W, MODEL_HEIGHT: H } = CONFIG.LOOKS;
const { KP } = CONFIG;
const STYLE = { lineWidth: 3, glow: false }; // model units (canvas pixels = model units)
const PEN_STEP = 4;      // min distance between recorded stroke points
const STROKE_HIT = 8;    // max distance from a stroke (or line shape) that still selects it
const MIN_SHAPE_HIT = 10; // so tiny shapes (Classic joint rings) can still be tapped
const LIMBS = [[KP.L_SHOULDER, KP.L_ELBOW], [KP.L_ELBOW, KP.L_WRIST], [KP.R_SHOULDER, KP.R_ELBOW],
    [KP.R_ELBOW, KP.R_WRIST], [KP.L_HIP, KP.L_KNEE], [KP.L_KNEE, KP.L_ANKLE], [KP.R_HIP, KP.R_KNEE],
    [KP.R_KNEE, KP.R_ANKLE], [KP.NECK, KP.NOSE]];

export class LookEditor {
    constructor(root, persons) {
        this.root = root;
        this.persons = persons;
        this.canvas = root.querySelector('#editor-canvas');
        this.ctx = this.canvas.getContext('2d');
        const $ = (id) => root.querySelector(`#editor-${id}`);
        this.el = {
            lookName: $('look-name'), color: $('color'), personColor: $('person-color'), scale: $('scale'),
            rotate: $('rotate'), del: $('delete'), preset: $('preset'), useDefault: $('default')
        };
        this.tabs = [...root.querySelectorAll('[data-slot]')];
        this.tools = [...root.querySelectorAll('[data-tool]')];
        this.slot = 0;
        this.tool = 'select';
        this.selected = null;
        this.drag = null; // { id: pointerId, last: {x, y}, moved } or { id, pen: [{x, y}] }
        this.returnFocus = null;
        this.onClose = null;
        for (const [key, look] of Object.entries(PRESETS)) this.el.preset.add(new Option(look.name, key));
        this.bindEvents();
    }

    get look() {
        return this.persons[this.slot] ?? PRESETS.classic;
    }

    open() {
        if (this.root.open) return;
        // Backing store at the device pixel ratio so lines stay crisp; drawing still uses model units.
        this.dpr = Math.min(window.devicePixelRatio || 1, 3);
        this.canvas.width = W * this.dpr;
        this.canvas.height = H * this.dpr;
        this.returnFocus = document.activeElement;
        this.render();
        this.root.showModal();
    }

    close() {
        if (this.root.open) this.root.close();
    }

    bindEvents() {
        const on = (el, type, fn) => el.addEventListener(type, fn);
        const { el } = this;
        on(this.root, 'close', () => {
            this.drag = null;
            this.returnFocus?.focus();
            this.onClose?.();
        });
        // On the document: after a tap on the (non-focusable) canvas the focus is on the body, not in the dialog.
        on(document, 'keydown', (e) => {
            if (this.root.open && (e.key === 'Delete' || e.key === 'Backspace') && !/^(INPUT|SELECT)$/.test(e.target.tagName)) {
                e.preventDefault();
                this.deleteSelected();
            }
        });
        on(this.root.querySelector('#editor-done'), 'click', () => this.close());
        this.tabs.forEach(b => on(b, 'click', () => {
            this.slot = Number(b.dataset.slot);
            this.selected = null;
            this.render();
        }));
        this.tools.forEach(b => on(b, 'click', () => this.setTool(b.dataset.tool)));

        on(this.canvas, 'pointerdown', (e) => this.pointerDown(e));
        on(this.canvas, 'pointermove', (e) => this.pointerMove(e));
        on(this.canvas, 'pointerup', (e) => this.pointerUp(e));
        on(this.canvas, 'pointercancel', (e) => this.pointerUp(e));

        on(el.color, 'input', () => {
            el.personColor.checked = false;
            this.editSelected(item => { item.color = el.color.value; });
        });
        on(el.personColor, 'change', () => this.editSelected(item => {
            item.color = el.personColor.checked ? null : el.color.value;
        }));
        on(el.scale, 'input', () => this.editSelected(item => { item.scale = Number(el.scale.value); }));
        on(el.rotate, 'input', () => this.editSelected(item => { item.rotation = Number(el.rotate.value) * Math.PI / 180; }));
        on(el.del, 'click', () => this.deleteSelected());
        on(this.root.querySelector('#editor-load'), 'click', () => this.setLook(copyLook(PRESETS[el.preset.value])));
        on(this.root.querySelector('#editor-clear'), 'click', () => this.setLook({ name: 'Custom', items: [] }));
        on(el.useDefault, 'click', () => this.setLook(null));
    }

    setTool(tool) {
        this.tool = tool;
        this.render();
    }

    // Replaces the slot's look (a copy of a preset, an empty look, or null = default look).
    setLook(look) {
        this.persons[this.slot] = look;
        this.selected = null;
        this.commit();
    }

    // The first edit of a slot without a custom look copies the default look into it (PRESETS stay unchanged);
    // the selection moves to the copied item.
    ensureCustom() {
        if (this.persons[this.slot]) return this.persons[this.slot];
        const index = PRESETS.classic.items.indexOf(this.selected);
        const look = this.persons[this.slot] = copyLook(PRESETS.classic);
        if (index >= 0) this.selected = look.items[index];
        return look;
    }

    editSelected(change) {
        if (!this.selected) return;
        this.ensureCustom();
        change(this.selected);
        this.commit(this.selected);
    }

    deleteSelected() {
        if (!this.selected) return;
        const look = this.ensureCustom();
        look.items.splice(look.items.indexOf(this.selected), 1);
        this.selected = null;
        this.commit();
    }

    // Re-anchors the edited item, saves every slot and redraws.
    commit(item = null) {
        if (item) bindItem(item);
        save(this.persons);
        this.render();
    }

    newItemColor() {
        return this.el.personColor.checked ? null : this.el.color.value;
    }

    // Client coordinates -> model units; the canvas may be CSS-scaled (and has no border or padding).
    toModel(e) {
        const r = this.canvas.getBoundingClientRect();
        return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }

    pointerDown(e) {
        if (this.drag || !e.isPrimary) return;
        e.preventDefault();
        this.canvas.setPointerCapture?.(e.pointerId);
        const p = this.toModel(e);
        if (this.tool === 'pen') {
            this.drag = { id: e.pointerId, pen: [p] };
            this.selected = null;
        } else if (SHAPE_TYPES.includes(this.tool)) {
            // A shape tool places one item, then hands over to Select (the same press can drag it).
            const item = createItem(this.tool, { x: p.x, y: p.y, color: this.newItemColor() });
            this.ensureCustom().items.push(item);
            this.selected = item;
            this.tool = 'select';
            this.drag = { id: e.pointerId, last: p, moved: false };
            this.commit();
            return;
        } else {
            this.selected = this.hitTest(p);
            this.drag = this.selected ? { id: e.pointerId, last: p, moved: false } : null;
        }
        this.render();
    }

    pointerMove(e) {
        const drag = this.drag;
        if (!drag || e.pointerId !== drag.id) return;
        const p = this.toModel(e);
        if (drag.pen) {
            const last = drag.pen[drag.pen.length - 1];
            if (Math.hypot(p.x - last.x, p.y - last.y) < PEN_STEP) return;
            drag.pen.push(p);
        } else {
            if (!drag.moved) this.ensureCustom();
            drag.moved = true;
            moveItem(this.selected, p.x - drag.last.x, p.y - drag.last.y);
            bindItem(this.selected);
            drag.last = p;
        }
        this.draw();
    }

    pointerUp(e) {
        const drag = this.drag;
        if (!drag || e.pointerId !== drag.id) return;
        this.drag = null;
        if (drag.pen) {
            if (drag.pen.length >= 2) {
                this.selected = createItem('stroke', { points: drag.pen, color: this.newItemColor() });
                this.ensureCustom().items.push(this.selected);
                this.commit();
            } else {
                this.draw();
            }
        } else if (drag.moved) {
            this.commit(this.selected);
        }
    }

    // Topmost item under p (items are drawn in order, so search from the end).
    hitTest(p) {
        const items = this.look.items;
        for (let i = items.length - 1; i >= 0; i--) {
            if (hits(items[i], p)) return items[i];
        }
        return null;
    }

    render() {
        this.draw();
        this.syncControls();
    }

    draw() {
        const { ctx, drag } = this;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
        drawSilhouette(ctx);
        const color = CONFIG.NEON_COLORS[this.slot];
        drawLook(ctx, this.look, identityMatrixFor, color, STYLE);
        if (drag?.pen) {
            ctx.strokeStyle = this.newItemColor() || color;
            ctx.beginPath();
            drag.pen.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.stroke();
        }
        if (this.selected) {
            const [x0, y0, x1, y1] = bounds(this.selected);
            ctx.save();
            ctx.setLineDash([5, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#fff';
            ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
            ctx.restore();
        }
    }

    syncControls() {
        const { el, selected: item } = this;
        const custom = this.persons[this.slot];
        this.tabs.forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.slot) === this.slot)));
        this.tools.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
        el.lookName.textContent = `Person ${this.slot + 1}: ${custom ? `${custom.name} (custom)` : 'Default look'}`;
        el.useDefault.disabled = !custom;
        el.del.disabled = !item;
        const shape = !!item && item.type !== 'stroke';
        el.scale.disabled = el.rotate.disabled = !shape;
        if (!item) return;
        el.personColor.checked = !item.color;
        if (item.color) el.color.value = item.color.toLowerCase();
        if (shape) {
            el.scale.value = item.scale;
            const deg = Math.round(item.rotation * 180 / Math.PI) % 360;
            el.rotate.value = deg > 180 ? deg - 360 : deg < -180 ? deg + 360 : deg;
        }
    }
}

function moveItem(item, dx, dy) {
    if (item.type === 'stroke') {
        for (const p of item.points) {
            p.x += dx;
            p.y += dy;
        }
    } else {
        item.x += dx;
        item.y += dy;
    }
}

function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

function hits(item, p) {
    if (item.type === 'stroke') {
        return item.points.some((a, i) => i > 0 && segmentDistance(p, item.points[i - 1], a) <= STROKE_HIT);
    }
    if (item.type === 'line') { // base line: 50 long, horizontal
        const hx = 25 * item.scale * Math.cos(item.rotation), hy = 25 * item.scale * Math.sin(item.rotation);
        return segmentDistance(p, { x: item.x - hx, y: item.y - hy }, { x: item.x + hx, y: item.y + hy }) <= STROKE_HIT;
    }
    return Math.hypot(p.x - item.x, p.y - item.y) <= Math.max(BASE_RADIUS * item.scale, MIN_SHAPE_HIT);
}

// Selection box [x0, y0, x1, y1] in model units.
function bounds(item) {
    if (item.type === 'stroke') {
        const xs = item.points.map(p => p.x), ys = item.points.map(p => p.y);
        return [Math.min(...xs) - 6, Math.min(...ys) - 6, Math.max(...xs) + 6, Math.max(...ys) + 6];
    }
    const r = BASE_RADIUS * item.scale + 2;
    return [item.x - r, item.y - r, item.x + r, item.y + r];
}

// Grey reference body plus a dot per keypoint, so items can be placed by eye.
function drawSilhouette(ctx) {
    const P = MODEL_POINTS;
    ctx.save();
    ctx.fillStyle = ctx.strokeStyle = '#2a2a2a';
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = 24;
    ctx.beginPath();
    [KP.L_SHOULDER, KP.R_SHOULDER, KP.R_HIP, KP.L_HIP].forEach((k, i) => (i ? ctx.lineTo(P[k].x, P[k].y) : ctx.moveTo(P[k].x, P[k].y)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 20;
    ctx.beginPath();
    for (const [a, b] of LIMBS) {
        ctx.moveTo(P[a].x, P[a].y);
        ctx.lineTo(P[b].x, P[b].y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(P[KP.NOSE].x, P[KP.NOSE].y - 8, 30, 36, 0, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#777';
    for (let k = 0; k < 17; k++) {
        ctx.beginPath();
        ctx.arc(P[k].x, P[k].y, 3, 0, 2 * Math.PI);
        ctx.fill();
    }
    ctx.restore();
}
