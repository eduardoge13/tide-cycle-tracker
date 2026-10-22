import { describe, expect, it } from 'vitest';
import { checkEntry } from '../src/lib/validation';
import type { PeriodEntry } from '../src/lib/types';

const today = '2025-06-15';
const existing: PeriodEntry[] = [
  { id: 'a', start: '2025-05-20', end: '2025-05-24', kind: 'period', flow: 'medium', createdAt: '', updatedAt: '' },
];

describe('checkEntry', () => {
  it('accepts a normal new period', () => {
    const r = checkEntry({ start: '2025-06-14', kind: 'period' }, existing, today);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('blocks future and impossible dates', () => {
    expect(checkEntry({ start: '2025-06-20', kind: 'period' }, existing, today).errors).not.toEqual([]);
    expect(checkEntry({ start: '2025-06-10', end: '2025-06-08', kind: 'period' }, existing, today).errors).not.toEqual([]);
    expect(checkEntry({ start: '2025-02-30', kind: 'period' }, existing, today).errors).not.toEqual([]);
  });

  it('blocks exact duplicates and points at the existing entry', () => {
    const r = checkEntry({ start: '2025-05-20', kind: 'period' }, existing, today);
    expect(r.errors[0]?.relatedId).toBe('a');
  });

  it('does not flag an entry as a duplicate of itself when editing', () => {
    const r = checkEntry({ id: 'a', start: '2025-05-20', end: '2025-05-25', kind: 'period' }, existing, today);
    expect(r.errors).toEqual([]);
  });

  it('warns (but does not block) on overlap and very short gaps', () => {
    const r = checkEntry({ start: '2025-05-22', kind: 'period' }, existing, today);
    expect(r.errors).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('allows a legitimately short irregular cycle with only a warning', () => {
    const r = checkEntry({ start: '2025-06-01', kind: 'period' }, existing, today); // 12 days later
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });
});
