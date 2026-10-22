import { describe, expect, it } from 'vitest';
import { backupDue, buildSummary } from '../src/lib/share';
import { buildDemoData } from '../src/lib/demo';
import { predict } from '../src/lib/prediction';
import { importJSON, exportJSON } from '../src/lib/storage';
import { emptyData } from '../src/lib/types';

const today = '2026-10-21';

describe('buildSummary (email body)', () => {
  const data = buildDemoData(today);
  data.dayLogs[today] = { date: today, feeling: 4, cramps: true, notes: 'Caminé 30 min', updatedAt: '' };
  const p = predict(data.periods, { today });
  const text = buildSummary(data, p, today);

  it('is readable Spanish with the estimate as a range', () => {
    expect(text).toMatch(/Próximo periodo estimado: entre /);
    expect(text).toMatch(/confianza (baja|media|alta)/);
  });

  it('lists recent periods and the last 30 days of notes', () => {
    expect(text).toMatch(/Últimos periodos:/);
    expect(text).toMatch(/🙂 Bien, cólicos, “Caminé 30 min”/);
  });

  it('explains how to restore the attachment', () => {
    expect(text).toMatch(/Importar respaldo/);
  });
});

describe('backupDue', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');

  it('is false with no data', () => {
    expect(backupDue(emptyData(), now)).toBe(false);
  });

  it('waits a week after the first record before the first reminder', () => {
    const d = buildDemoData(today);
    d.periods.forEach((p) => (p.createdAt = '2026-10-18T10:00:00Z')); // 3 days ago
    expect(backupDue(d, now)).toBe(false);
    d.periods.forEach((p) => (p.createdAt = '2026-10-10T10:00:00Z')); // 11 days ago
    expect(backupDue(d, now)).toBe(true);
  });

  it('is true when the last backup is older than 30 days', () => {
    const d = buildDemoData(today);
    d.settings.lastBackupAt = '2026-09-01T10:00:00Z';
    expect(backupDue(d, now)).toBe(true);
  });

  it('is false right after a backup', () => {
    const d = buildDemoData(today);
    d.settings.lastBackupAt = '2026-10-15T10:00:00Z';
    expect(backupDue(d, now)).toBe(false);
  });
});

describe('new fields survive export → import', () => {
  it('keeps feeling and lastBackupAt', () => {
    const d = buildDemoData(today);
    d.dayLogs[today] = { date: today, feeling: 5, updatedAt: '' };
    d.settings.lastBackupAt = '2026-10-20T08:00:00Z';
    const r = importJSON(exportJSON(d));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.dayLogs[today]?.feeling).toBe(5);
      expect(r.data.settings.lastBackupAt).toBe('2026-10-20T08:00:00Z');
    }
  });

  it('rejects an out-of-range feeling', () => {
    const r = importJSON(JSON.stringify({ version: 1, periods: [], dayLogs: { [today]: { feeling: 9 } } }));
    expect(r.ok).toBe(false);
  });
});
