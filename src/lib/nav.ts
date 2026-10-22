import { createContext, useContext } from 'react';
import type { ISODate } from './dates';

export type Route =
  | { name: 'today' }
  | { name: 'calendar'; date?: ISODate }
  | { name: 'log'; tab: 'period' | 'day'; editId?: string; date?: ISODate }
  | { name: 'history'; adding?: boolean }
  | { name: 'stats' }
  | { name: 'settings' };

/** Optional button inside a toast, e.g. "Deshacer". */
export interface ToastAction {
  label: string;
  run(): void;
}

export interface Nav {
  route: Route;
  go(route: Route): void;
  notify(message: string, action?: ToastAction): void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used inside the app shell');
  return nav;
}
