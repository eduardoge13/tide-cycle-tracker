import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayISO, type ISODate } from './dates';
import { evaluatePrediction, predict, type Prediction } from './prediction';
import { clearData, getDefaultStore, loadData, saveData, type LoadResult } from './storage';
import { buildDemoData } from './demo';
import { emptyData, type AppData, type DayLog, type PeriodEntry, type PredictionCheck, type Scale5, type Settings } from './types';

export type PeriodInput = Omit<PeriodEntry, 'id' | 'createdAt' | 'updatedAt'>;

interface StoreValue {
  data: AppData;
  today: ISODate;
  prediction: Prediction;
  storageStatus: LoadResult['status'];
  saveFailed: boolean;
  addPeriod(input: PeriodInput): { entry: PeriodEntry; check: PredictionCheck | null };
  updatePeriod(id: string, input: PeriodInput): void;
  deletePeriod(id: string): void;
  saveDayLog(log: DayLog): void;
  deleteDayLog(date: ISODate): void;
  updateSettings(patch: Partial<Settings>): void;
  replaceAll(data: AppData): void;
  deleteEverything(): void;
  loadDemo(): void;
  /** One-tap check-in; tapping the same face again clears it. */
  setFeeling(date: ISODate, feeling: Scale5 | undefined): void;
  markBackedUp(): void;
}

const StoreContext = createContext<StoreValue | null>(null);

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function sortPeriods(list: PeriodEntry[]): PeriodEntry[] {
  return [...list].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

/** Drop checks whose "actual" period no longer exists (edited or deleted). */
function pruneChecks(data: AppData): PredictionCheck[] {
  const starts = new Set(data.periods.filter((p) => p.kind === 'period').map((p) => p.start));
  return data.predictionChecks.filter((c) => starts.has(c.actualStart) && starts.has(c.previousStart));
}

function predictFor(data: AppData, today: ISODate): Prediction {
  return predict(data.periods, {
    today,
    defaultCycleLength: data.settings.defaultCycleLength,
    defaultPeriodLength: data.settings.defaultPeriodLength,
    checks: data.predictionChecks,
  });
}

function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    // Re-check when the app comes back to the foreground (e.g. next morning).
    const refresh = () => setToday(todayISO());
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.clearInterval(timer);
    };
  }, []);
  return today;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef(getDefaultStore());
  const [initial] = useState(() => loadData(storeRef.current));
  const [data, setData] = useState<AppData>(initial.data);
  const [storageStatus, setStorageStatus] = useState(initial.status);
  const [saveFailed, setSaveFailed] = useState(false);
  const today = useToday();

  useEffect(() => {
    // Don't overwrite unreadable (corrupt) data until the user changes something.
    if (data === initial.data) return;
    setSaveFailed(!saveData(storeRef.current, data));
    if (storageStatus === 'corrupt' || storageStatus === 'empty') setStorageStatus('ok');
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const prediction = useMemo(() => predictFor(data, today), [data, today]);

  const addPeriod = useCallback<StoreValue['addPeriod']>(
    (input) => {
      const stamp = new Date().toISOString();
      const entry: PeriodEntry = { ...input, id: newId(), createdAt: stamp, updatedAt: stamp };
      // Compare the estimate we were showing with what actually happened.
      let check: PredictionCheck | null = null;
      if (entry.kind === 'period') {
        const before = predictFor(data, today);
        if (before.lastStart && entry.start > before.lastStart) check = evaluatePrediction(before, entry.start);
      }
      setData((d) => ({
        ...d,
        periods: sortPeriods([...d.periods, entry]),
        predictionChecks: check ? [...d.predictionChecks, check] : d.predictionChecks,
      }));
      return { entry, check };
    },
    [data, today],
  );

  const updatePeriod = useCallback((id: string, input: PeriodInput) => {
    setData((d) => {
      const periods = sortPeriods(
        d.periods.map((p) => (p.id === id ? { ...p, ...input, id, updatedAt: new Date().toISOString() } : p)),
      );
      const next = { ...d, periods };
      return { ...next, predictionChecks: pruneChecks(next) };
    });
  }, []);

  const deletePeriod = useCallback((id: string) => {
    setData((d) => {
      const next = { ...d, periods: d.periods.filter((p) => p.id !== id) };
      return { ...next, predictionChecks: pruneChecks(next) };
    });
  }, []);

  const saveDayLog = useCallback((log: DayLog) => {
    setData((d) => ({ ...d, dayLogs: { ...d.dayLogs, [log.date]: { ...log, updatedAt: new Date().toISOString() } } }));
  }, []);

  const deleteDayLog = useCallback((date: ISODate) => {
    setData((d) => {
      const dayLogs = { ...d.dayLogs };
      delete dayLogs[date];
      return { ...d, dayLogs };
    });
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  }, []);

  const replaceAll = useCallback((next: AppData) => setData(next), []);

  const deleteEverything = useCallback(() => {
    clearData(storeRef.current);
    setData((d) => ({ ...emptyData(), settings: { ...d.settings, theme: d.settings.theme } }));
  }, []);

  const loadDemo = useCallback(() => setData((d) => buildDemoData(today, d.settings)), [today]);

  const setFeeling = useCallback((date: ISODate, feeling: Scale5 | undefined) => {
    setData((d) => {
      const current: DayLog = d.dayLogs[date] ?? { date, updatedAt: '' };
      const next: DayLog = { ...current, updatedAt: new Date().toISOString() };
      if (feeling === undefined) delete next.feeling;
      else next.feeling = feeling;
      const dayLogs = { ...d.dayLogs };
      // A log that only held the feeling disappears when it's cleared.
      const { date: _d, updatedAt: _u, ...rest } = next;
      if (Object.keys(rest).length === 0) delete dayLogs[date];
      else dayLogs[date] = next;
      return { ...d, dayLogs };
    });
  }, []);

  const markBackedUp = useCallback(() => {
    setData((d) => ({ ...d, settings: { ...d.settings, lastBackupAt: new Date().toISOString() } }));
  }, []);

  const value: StoreValue = {
    data,
    today,
    prediction,
    storageStatus,
    saveFailed,
    addPeriod,
    updatePeriod,
    deletePeriod,
    saveDayLog,
    deleteDayLog,
    updateSettings,
    replaceAll,
    deleteEverything,
    loadDemo,
    setFeeling,
    markBackedUp,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
