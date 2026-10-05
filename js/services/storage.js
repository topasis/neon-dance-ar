// Per-person looks in localStorage (add-look-editor design §4). Never throws: storage may be missing, blocked (it
// throws on access in some private modes), full, or hold data from an older or broken version.
//
// API
//   load(storage?) -> persons   array of CONFIG.LOOKS.MAX_PERSONS entries, each a Look (sanitized, anchors bound) or
//                               null (= default look). All null when nothing valid is stored.
//   save(persons, storage?) -> boolean   writes { version: 1, persons }; anchor caches ('_' fields) are left out.
//                               false when storage is unavailable or the write failed.
//   `storage` defaults to window.localStorage; tests pass a fake with getItem/setItem.
import { CONFIG } from '../config.js';
import { sanitizeLook } from '../ui/looks.js';

const VERSION = 1;

function defaultStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

const emptyPersons = () => new Array(CONFIG.LOOKS.MAX_PERSONS).fill(null);

export function load(storage = defaultStorage()) {
    const persons = emptyPersons();
    try {
        const raw = storage?.getItem(CONFIG.LOOKS.STORAGE_KEY);
        if (!raw) return persons;
        const data = JSON.parse(raw);
        if (data?.version !== VERSION || !Array.isArray(data.persons)) return persons;
        for (let i = 0; i < persons.length; i++) persons[i] = sanitizeLook(data.persons[i]);
    } catch (e) {
        console.warn('Saved looks could not be loaded; using defaults.', e);
        return emptyPersons();
    }
    return persons;
}

export function save(persons, storage = defaultStorage()) {
    if (!storage) return false;
    try {
        const json = JSON.stringify({ version: VERSION, persons },
            (key, value) => (key.startsWith('_') ? undefined : value));
        storage.setItem(CONFIG.LOOKS.STORAGE_KEY, json);
        return true;
    } catch (e) {
        console.warn('Looks could not be saved.', e);
        return false;
    }
}
