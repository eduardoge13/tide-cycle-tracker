import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  exportJSON,
  importJSON,
  loadData,
  migrate,
  parseAppData,
  saveData,
  type KeyValueStore,
} from '../src/lib/storage';
import { buildDemoData } from '../src/lib/demo';
import { emptyData } from '../src/lib/types';

function memoryStore(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

describe('storage', () => {
  it('round-trips data under the versioned key', () => {
    const store = memoryStore();
    const data = buildDemoData('2025-06-15');
    expect(saveData(store, data)).toBe(true);
    expect([...store.map.keys()]).toEqual([STORAGE_KEY]);
    const loaded = loadData(store);
    expect(loaded.status).toBe('ok');
    expect(loaded.data.periods).toHaveLength(data.periods.length);
  });

  it('reports empty and corrupt storage without throwing', () => {
    const store = memoryStore();
    expect(loadData(store).status).toBe('empty');
    store.setItem(STORAGE_KEY, '{not json');
    expect(loadData(store).status).toBe('corrupt');
    expect(loadData(null).status).toBe('unavailable');
  });

  it('migrates an unversioned (v0) object', () => {
    const v0 = { cycles: [{ id: 'x', start: '2025-01-01', flow: 'light' }] };
    const migrated = migrate(v0);
    expect(migrated.version).toBe(1);
    const parsed = parseAppData(v0);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.data.periods[0]?.kind).toBe('period');
  });

  it('refuses data from a newer version', () => {
    const r = parseAppData({ ...emptyData(), version: 99 });
    expect(r.ok).toBe(false);
  });

  it('export → import round trip', () => {
    const data = buildDemoData('2025-06-15');
    const r = importJSON(exportJSON(data));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.periods).toEqual(data.periods);
      expect(Object.keys(r.data.dayLogs)).toEqual(Object.keys(data.dayLogs));
    }
  });

  it('rejects malformed imports with readable errors', () => {
    expect(importJSON('hello').ok).toBe(false);
    expect(importJSON('[]').ok).toBe(false);
    const bad = importJSON(JSON.stringify({ version: 1, periods: [{ id: 'a', start: '2025-02-31' }] }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]).toMatch(/fecha de inicio/);
    const badLog = importJSON(JSON.stringify({ version: 1, periods: [], dayLogs: { '2025-01-01': { pain: 9 } } }));
    expect(badLog.ok).toBe(false);
    const dupIds = importJSON(
      JSON.stringify({ version: 1, periods: [{ id: 'a', start: '2025-01-01' }, { id: 'a', start: '2025-02-01' }] }),
    );
    expect(dupIds.ok).toBe(false);
  });

  it('falls back to safe settings when values are out of range', () => {
    const r = parseAppData({ version: 1, periods: [], settings: { defaultCycleLength: 500, theme: 'neon' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.settings.defaultCycleLength).toBe(28);
      expect(r.data.settings.theme).toBe('system');
    }
  });
});
