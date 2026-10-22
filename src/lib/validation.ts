/**
 * Checks for a period entry before it is saved.
 *
 * `errors` block saving (impossible data, exact duplicates).
 * `warnings` are shown but never block — irregular cycles are legitimate.
 */

import { diffDays, isValidISODate, type ISODate } from './dates';
import type { PeriodEntry } from './types';
import { MIN_CYCLE } from './prediction';

export interface EntryDraft {
  id?: string;
  start: string;
  end?: string;
  kind: PeriodEntry['kind'];
}

export interface EntryIssue {
  message: string;
  /** An existing entry the user may want to edit instead. */
  relatedId?: string;
}

export interface EntryCheck {
  errors: EntryIssue[];
  warnings: EntryIssue[];
}

export const MAX_NOTES = 2000;

function entryEnd(p: { start: ISODate; end?: ISODate }): ISODate {
  return p.end && isValidISODate(p.end) ? p.end : p.start;
}

export function checkEntry(draft: EntryDraft, existing: readonly PeriodEntry[], today: ISODate): EntryCheck {
  const errors: EntryIssue[] = [];
  const warnings: EntryIssue[] = [];

  if (!isValidISODate(draft.start)) {
    errors.push({ message: 'Elige un primer día válido.' });
    return { errors, warnings };
  }
  if (draft.start > today) errors.push({ message: 'El primer día no puede ser en el futuro.' });

  const hasEnd = draft.end !== undefined && draft.end !== '';
  if (hasEnd) {
    if (!isValidISODate(draft.end)) errors.push({ message: 'Elige un último día válido, o déjalo vacío.' });
    else {
      if (draft.end < draft.start) errors.push({ message: 'El último día es antes del primero.' });
      if (draft.end > today) errors.push({ message: 'El último día no puede ser en el futuro. Déjalo vacío si el sangrado no ha terminado.' });
      const length = diffDays(draft.start, draft.end) + 1;
      if (length > 10 && draft.end >= draft.start) {
        warnings.push({ message: `Son ${length} días de sangrado. Vale la pena comentarlo con tu médico.` });
      }
    }
  }
  if (errors.length) return { errors, warnings };

  const others = existing.filter((p) => p.id !== draft.id && isValidISODate(p.start));
  const draftEnd = hasEnd ? draft.end! : draft.start;

  const duplicate = others.find((p) => p.start === draft.start);
  if (duplicate) {
    errors.push({
      message: `Ya tienes ${duplicate.kind === 'period' ? 'un periodo' : 'un manchado'} registrado que empieza este día.`,
      relatedId: duplicate.id,
    });
    return { errors, warnings };
  }

  for (const p of others) {
    const overlaps = draft.start <= entryEnd(p) && draftEnd >= p.start;
    if (overlaps) {
      warnings.push({
        message: `Se empalma con otro registro de ${p.kind === 'period' ? 'periodo' : 'manchado'}. Si es el mismo sangrado, mejor edita ese registro.`,
        relatedId: p.id,
      });
    }
  }

  if (draft.kind === 'period') {
    const periodStarts = others.filter((p) => p.kind === 'period').map((p) => p.start);
    for (const s of periodStarts) {
      const gap = Math.abs(diffDays(s, draft.start));
      if (gap > 0 && gap < MIN_CYCLE) {
        warnings.push({
          message: `Solo ${gap} días después de otro inicio de periodo. Se guardará, pero no contará como un ciclo nuevo para las estimaciones.`,
        });
        break;
      }
    }
  }

  return { errors, warnings };
}
