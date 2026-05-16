# MyFin API

Use this skill when working in this repository on API code, tests, Prisma schema/migrations, OpenAPI docs, or project maintenance.

## Runtime

Run Node/npm tooling through WSL or a Linux shell, not PowerShell.

```bash
wsl --cd <repo-wsl-path> bash -lic "npm run test:unit:run"
```

Replace `<repo-wsl-path>` with this checkout's Linux path. Use `bash -lic` so shell startup tooling such as nvm loads Node/npm. If search tooling is needed and `rg` resolves to a Windows path or fails, use `find`, `grep`, `sed`, or `git grep`.

Do not add personal machine paths, usernames, local absolute home directories, secrets, tokens, or private environment values to this file.

## Workflow

1. Read `AGENTS.md` first.
2. Check `git status --short` and avoid touching unrelated user changes.
3. Keep edits scoped to the request.
4. Use existing controller/service/route/Prisma patterns before adding new ones.
5. Verify with the smallest relevant command:
   - `npm run test:unit:run` for unit-covered logic.
   - `npm run build` for TypeScript safety.
   - `npm run check` for Biome checks.
   - `npm run test:integration` for database/API flows.

## Project Map

- `src/controllers`: HTTP controllers.
- `src/services`: domain and business logic.
- `src/routes`: route definitions and router wiring.
- `src/config/prisma.ts`: Prisma client setup.
- `prisma/schema.prisma`: database schema.
- `src/docs/openApi.ts`: OpenAPI generation/configuration.
- `src/locales/en.json` and `src/locales/pt.json`: localized strings.
- `__tests__/unit`: unit tests.
- `__tests__/integration`: Docker-backed integration tests.
