/**
 * "Send my records": builds a readable summary plus the full JSON backup and
 * hands both to the iPhone share sheet (Mail, Files, AirDrop…). The app never
 * sends anything itself; the user picks where it goes.
 */

import { diffDays, formatDate, formatRange, type ISODate } from './dates';
import type { Prediction } from './prediction';
import { exportJSON } from './storage';
import { computeStats } from './stats';
import { BLEEDING_LABEL, FEELINGS, FLOW_LABEL, type AppData } from './types';

const CONFIDENCE_ES = { low: 'baja', medium: 'media', high: 'alta' } as const;

export function buildSummary(data: AppData, prediction: Prediction, today: ISODate): string {
  const lines: string[] = [];
  lines.push('Mis registros de ciclo (Tide)');
  lines.push(`Generado el ${formatDate(today, { day: 'numeric', month: 'long', year: 'numeric' })}`);
  lines.push('');

  if (prediction.rangeStart && prediction.rangeEnd) {
    lines.push(
      `Próximo periodo estimado: entre ${formatRange(prediction.rangeStart, prediction.rangeEnd)} (confianza ${CONFIDENCE_ES[prediction.confidence]}).`,
    );
  }
  const stats = computeStats(prediction.samples, data.periods);
  const parts: string[] = [];
  if (stats.averageCycle !== null) parts.push(`ciclo promedio ${stats.averageCycle} días`);
  if (stats.averagePeriod !== null) parts.push(`periodo promedio ${stats.averagePeriod} días`);
  if (stats.cyclesTracked) parts.push(`${stats.cyclesTracked} ciclos registrados`);
  if (parts.length) lines.push(parts.join(' · ').replace(/^./, (c) => c.toUpperCase()) + '.');

  const periods = data.periods
    .filter((p) => p.kind === 'period')
    .sort((a, b) => (a.start < b.start ? 1 : -1))
    .slice(0, 6);
  if (periods.length) {
    lines.push('', 'Últimos periodos:');
    for (const p of periods) {
      const span = p.end ? `${formatDate(p.start, { day: 'numeric', month: 'short', year: 'numeric' })} – ${formatDate(p.end)} (${diffDays(p.start, p.end) + 1} días)` : `${formatDate(p.start, { day: 'numeric', month: 'short', year: 'numeric' })} (sin fecha de fin)`;
      lines.push(`• ${span}, flujo ${FLOW_LABEL[p.flow].toLowerCase()}`);
    }
  }

  const recentLogs = Object.values(data.dayLogs)
    .filter((l) => l.date <= today && diffDays(l.date, today) < 30)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (recentLogs.length) {
    lines.push('', 'Últimos 30 días:');
    for (const l of recentLogs) {
      const bits: string[] = [];
      const feeling = FEELINGS.find((f) => f.value === l.feeling);
      if (feeling) bits.push(`${feeling.emoji} ${feeling.label}`);
      if (l.bleeding && l.bleeding !== 'none') bits.push(`sangrado ${BLEEDING_LABEL[l.bleeding].toLowerCase()}`);
      if (l.cramps) bits.push('cólicos');
      if (l.headache) bits.push('dolor de cabeza');
      if (l.bloating) bits.push('inflamación');
      if (l.notes) bits.push(`“${l.notes.replace(/\s+/g, ' ').slice(0, 120)}”`);
      if (bits.length) lines.push(`• ${formatDate(l.date)}: ${bits.join(', ')}`);
    }
  }

  lines.push('', 'El archivo adjunto es un respaldo completo. Para restaurarlo: Tide → Ajustes → Importar respaldo.');
  return lines.join('\n');
}

export type ShareResult = 'shared' | 'downloaded' | 'cancelled';

export async function shareRecords(data: AppData, prediction: Prediction, today: ISODate): Promise<ShareResult> {
  const fileName = `registros-ciclo-${today}.json`;
  const json = exportJSON(data);
  const text = buildSummary(data, prediction, today);

  if (typeof File !== 'undefined' && typeof navigator.share === 'function') {
    const file = new File([json], fileName, { type: 'application/json' });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: 'Mis registros de ciclo', text, files: [file] });
        return 'shared';
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
        // Otherwise fall through to a plain download.
      }
    }
  }

  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

const DAY_MS = 86_400_000;

/**
 * True when records haven't been sent in the last 30 days. Before the first
 * backup, wait until the oldest record is a week old, so day one isn't nagging.
 */
export function backupDue(data: AppData, now = Date.now()): boolean {
  const stamps = [...data.periods.map((p) => p.createdAt), ...Object.values(data.dayLogs).map((l) => l.updatedAt)]
    .map((s) => Date.parse(s))
    .filter((t) => !Number.isNaN(t));
  if (stamps.length === 0) return false;
  const last = data.settings.lastBackupAt ? Date.parse(data.settings.lastBackupAt) : NaN;
  if (!Number.isNaN(last)) return now - last > 30 * DAY_MS;
  return now - Math.min(...stamps) >= 7 * DAY_MS;
}
