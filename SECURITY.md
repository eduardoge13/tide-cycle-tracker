# Security and privacy

Tide handles menstrual health data, so the privacy model is the main feature, not an add-on.

## What the app does and doesn't do

- All data lives in the browser's `localStorage` under one key, `cycleTracker:v1`. There is no backend, account, analytics or third-party script.
- The production build ships a Content-Security-Policy of `default-src 'self'` with `connect-src 'self'`, so the page cannot send data to another origin even if a dependency tried.
- The service worker caches only the app's own static files. It cannot read `localStorage`.
- Data leaves the device only when the user exports it or sends it through the share sheet, and only to the destination they pick.
- The example nginx config (`deploy/nginx.conf`) turns access logs off.

## Out of scope

- Anyone with the unlocked device can open the app. There is no app-level PIN.
- Exported backups are plain JSON and are not encrypted.
- Clearing browser storage deletes the data permanently.

## Reporting a vulnerability

Please report it privately through GitHub's **Report a vulnerability** button (Security tab), not as a public issue. Include the steps to reproduce, the browser and the version.

**Never attach a real backup file or real cycle dates** to an issue or report. Use **Ajustes → Cargar datos de ejemplo** to reproduce problems with fictional data.
