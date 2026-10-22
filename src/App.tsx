import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavContext, type Nav, type Route } from './lib/nav';
import { useStore } from './lib/store';
import { Icon, Notice, Toast, type IconName, type ToastState } from './components/ui';
import { Dashboard } from './screens/Dashboard';
import { CalendarScreen } from './screens/CalendarScreen';
import { LogScreen } from './screens/LogScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { StatsScreen } from './screens/StatsScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const NAV_ITEMS: { name: Route['name']; label: string; icon: IconName; route: Route }[] = [
  { name: 'today', label: 'Hoy', icon: 'today', route: { name: 'today' } },
  { name: 'calendar', label: 'Calendario', icon: 'calendar', route: { name: 'calendar' } },
  { name: 'log', label: 'Registrar', icon: 'plus', route: { name: 'log', tab: 'period' } },
  { name: 'stats', label: 'Resumen', icon: 'chart', route: { name: 'stats' } },
  { name: 'history', label: 'Historial', icon: 'list', route: { name: 'history' } },
];

function useTheme(pref: 'system' | 'light' | 'dark') {
  useEffect(() => {
    const root = document.documentElement;
    if (pref === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', pref);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = pref === 'dark' || (pref === 'system' && mq.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1a1517' : '#f6f1ea');
    };
    apply();
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [pref]);
}

export function App() {
  const { data, storageStatus, saveFailed } = useStore();
  const [route, setRoute] = useState<Route>(() => (history.state?.route as Route | undefined) ?? { name: 'today' });
  const [toast, setToast] = useState<ToastState | null>(null);
  useTheme(data.settings.theme);

  // Browser back/forward (and Android back) move between screens.
  useEffect(() => {
    if (!history.state?.route) history.replaceState({ route }, '');
    const onPop = (e: PopStateEvent) => setRoute((e.state?.route as Route | undefined) ?? { name: 'today' });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((next: Route) => {
    history.pushState({ route: next }, '');
    setRoute(next);
    window.scrollTo({ top: 0 });
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  const notify = useCallback<Nav['notify']>((message, action) => setToast({ message, ...(action ? { action } : {}) }), []);
  const nav = useMemo<Nav>(() => ({ route, go, notify }), [route, go, notify]);

  let screen;
  switch (route.name) {
    case 'today':
      screen = <Dashboard />;
      break;
    case 'calendar':
      screen = <CalendarScreen initialDate={route.date} />;
      break;
    case 'log':
      screen = <LogScreen key={`${route.tab}-${route.editId ?? ''}-${route.date ?? ''}`} tab={route.tab} editId={route.editId} date={route.date} />;
      break;
    case 'history':
      screen = <HistoryScreen key={String(route.adding)} adding={route.adding} />;
      break;
    case 'stats':
      screen = <StatsScreen />;
      break;
    case 'settings':
      screen = <SettingsScreen />;
      break;
  }

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header className="topbar">
          <button className="brand" onClick={() => go({ name: 'today' })} aria-label="Tide, ir a Hoy">
            <span className="brand-mark" aria-hidden />
            <span className="brand-name">Tide</span>
          </button>
          <span className="topbar-private">
            <Icon name="lock" size={14} /> Solo en este teléfono
          </span>
          <button
            className={`icon-btn ${route.name === 'settings' ? 'is-active' : ''}`}
            onClick={() => go({ name: 'settings' })}
            aria-label="Ajustes y privacidad"
          >
            <Icon name="settings" />
          </button>
        </header>

        <nav className="sidenav" aria-label="Principal">
          {[...NAV_ITEMS, { name: 'settings' as const, label: 'Ajustes', icon: 'settings' as const, route: { name: 'settings' } as Route }].map((item) => (
            <button key={item.name} className={route.name === item.name ? 'on' : ''} aria-current={route.name === item.name ? 'page' : undefined} onClick={() => go(item.route)}>
              <Icon name={item.icon} /> {item.label}
            </button>
          ))}
        </nav>

        <main className="main" id="main">
          {storageStatus === 'corrupt' && (
            <Notice tone="error">
              No se pudieron leer los datos guardados en este teléfono, así que la app empezó vacía. Todavía no se han
              borrado. Importa un respaldo en Ajustes, o empieza a registrar para reemplazarlos.
            </Notice>
          )}
          {saveFailed && <Notice tone="error">No se pudo guardar en este teléfono. El almacenamiento puede estar lleno o bloqueado. Envíate una copia ahora.</Notice>}
          {screen}
        </main>

        <nav className="tabbar" aria-label="Principal">
          {NAV_ITEMS.map((item) => {
            const on = route.name === item.name;
            return (
              <button
                key={item.name}
                className={`${on ? 'on' : ''} ${item.name === 'log' ? 'tab-log' : ''}`}
                aria-current={on ? 'page' : undefined}
                onClick={() => go(item.route)}
              >
                <span className="tab-icon">
                  <Icon name={item.icon} size={item.name === 'log' ? 26 : 22} />
                </span>
                <span className="tab-label">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <Toast toast={toast} onDone={clearToast} />
      </div>
    </NavContext.Provider>
  );
}
