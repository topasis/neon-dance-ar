import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/config.js';
import { load, save } from '../js/services/storage.js';
import { PRESETS, copyLook } from '../js/ui/looks.js';

const KEY = CONFIG.LOOKS.STORAGE_KEY;
const N = CONFIG.LOOKS.MAX_PERSONS;
const allNull = new Array(N).fill(null);

function fakeStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    return {
        data,
        getItem: (k) => (data.has(k) ? data.get(k) : null),
        setItem: (k, v) => { data.set(k, String(v)); }
    };
}
const throwing = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { throw new Error('QuotaExceededError'); }
};

test('nothing stored -> every person uses the default look', () => {
    assert.deepEqual(load(fakeStorage()), allNull);
});

test('save then load restores the looks, without anchor caches', () => {
    const storage = fakeStorage();
    const persons = [...allNull];
    persons[0] = copyLook(PRESETS.party);
    persons[3] = { name: 'Empty', items: [] };
    assert.equal(save(persons, storage), true);
    assert.ok(!storage.data.get(KEY).includes('"_bone'), 'caches are not saved');
    const loaded = load(storage);
    assert.equal(loaded.length, N);
    assert.deepEqual(loaded[0], copyLook(PRESETS.party));
    assert.deepEqual(loaded[3], { name: 'Empty', items: [] });
    assert.equal(loaded[1], null);
    assert.equal(loaded[0].items[0]._bone, 'EYES', 'anchors are rebuilt on load');
});

test('throwing storage: load falls back to defaults, save reports failure', () => {
    assert.deepEqual(load(throwing), allNull);
    assert.equal(save(allNull, throwing), false);
});

test('missing storage (null) and a localStorage getter that throws', () => {
    assert.deepEqual(load(null), allNull);
    assert.equal(save(allNull, null), false);
    const desc = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    try {
        assert.deepEqual(load(), allNull);
        assert.equal(save(allNull), false);
    } finally {
        if (desc) Object.defineProperty(globalThis, 'localStorage', desc);
        else delete globalThis.localStorage;
    }
});

test('invalid JSON, wrong version or wrong shape -> defaults', () => {
    for (const raw of ['{not json', JSON.stringify({ version: 2, persons: [] }), JSON.stringify({ version: 1 }),
        JSON.stringify('x'), 'null']) {
        assert.deepEqual(load(fakeStorage({ [KEY]: raw })), allNull, raw);
    }
});

test('short or long person arrays and invalid looks are normalised', () => {
    const raw = JSON.stringify({ version: 1, persons: [{ name: 'A', items: [] }, 42, null, { items: 'x' }, null, { name: 'extra', items: [] }] });
    const loaded = load(fakeStorage({ [KEY]: raw }));
    assert.equal(loaded.length, N);
    assert.deepEqual(loaded, [{ name: 'A', items: [] }, null, null, null, null]);
    const short = load(fakeStorage({ [KEY]: JSON.stringify({ version: 1, persons: [{ name: 'B', items: [] }] }) }));
    assert.deepEqual(short, [{ name: 'B', items: [] }, null, null, null, null]);
});
