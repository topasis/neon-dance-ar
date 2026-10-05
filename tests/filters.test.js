import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OneEuroFilter } from '../js/logic/filters.js';

test('first sample passes through unchanged', () => {
    const f = new OneEuroFilter();
    assert.equal(f.filter(42, 0), 42);
});

test('a constant signal stays constant', () => {
    const f = new OneEuroFilter();
    for (let i = 0; i < 30; i++) assert.equal(f.filter(10, i / 30), 10);
});

test('a jump is smoothed: the output moves toward the new value without reaching it at once', () => {
    const f = new OneEuroFilter();
    f.filter(0, 0);
    const y = f.filter(100, 1 / 30);
    assert.ok(y > 0 && y < 100, `got ${y}`);
    let last = y;
    for (let i = 2; i < 60; i++) {
        const next = f.filter(100, i / 30);
        assert.ok(next >= last && next <= 100);
        last = next;
    }
    assert.ok(last > 99, `converges, got ${last}`);
});

test('the same inputs and timestamps give the same outputs', () => {
    const a = new OneEuroFilter();
    const b = new OneEuroFilter();
    [3, 8, 2, 15, 15, 40, 38].forEach((x, i) => assert.equal(a.filter(x, i * 0.04), b.filter(x, i * 0.04)));
});

test('a non-increasing timestamp returns the raw value and keeps the state', () => {
    const f = new OneEuroFilter();
    f.filter(0, 1);
    assert.equal(f.filter(50, 1), 50);
    assert.equal(f.xPrev, 0);
    assert.equal(f.tPrev, 1);
});
