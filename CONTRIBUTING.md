# Contributing

Thanks for taking a look. Issues and pull requests are welcome.

## Setup

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck
npm run build
```

## Ground rules

- **No network calls, analytics or third-party scripts.** The production CSP blocks them anyway; a PR that needs to loosen it will not be merged.
- **Never log cycle data** (`console.*` with user data, error messages that echo records).
- **Dates are `YYYY-MM-DD` strings.** Use the helpers in `src/lib/dates.ts`; don't do arithmetic on `Date` objects with local time.
- **The prediction engine stays pure.** `src/lib/prediction.ts` takes `today` as an argument and has no side effects. Changes there need tests in `tests/prediction.test.ts`, including the boundary case.
- **Schema changes need a migration.** Bump `CURRENT_VERSION` and add a step to `MIGRATIONS` in `src/lib/storage.ts`.
- **Never paste real health data** into issues, tests or screenshots. Use the demo data.

## Good first contributions

- An English locale. The UI is Spanish-only today; strings live in the screen components.
- Component tests for the screens (React Testing Library).
- An optional app-level PIN.

## License of contributions

By opening a pull request you agree that your contribution is licensed under the project's [PolyForm Noncommercial 1.0.0](LICENSE) license.
