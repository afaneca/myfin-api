# Codex Instructions

## Project

MyFin API is a Node.js Express backend written in TypeScript. It uses Prisma for the database layer, Vitest for tests, Biome for linting/formatting, and Docker Compose for integration-test services.

Keep changes narrowly scoped to the user's request. Avoid unrelated refactors, formatting churn, dependency bumps, generated-file edits, or API/schema changes unless they are required for the task. If an adjacent change looks useful but is not necessary, call it out instead of applying it.

## Runtime And Shell

This project is intended to run from WSL or a Linux shell. When running project commands from Codex Desktop on Windows, prefer WSL commands instead of PowerShell because PowerShell may not have this project's Node/npm toolchain on `PATH`.

Use this pattern for Node/npm commands:

```bash
wsl --cd <repo-wsl-path> bash -lic "npm run test:unit:run"
```

Replace `<repo-wsl-path>` with this checkout's Linux path. The `bash -lic` part matters when Node and npm are provided by shell startup tooling such as nvm, because a login shell loads that environment.

Do not spend time rediscovering that `npm` is missing in PowerShell. Start with WSL for `node`, `npm`, `npx`, `prisma`, `vitest`, `tsx`, Docker Compose, and other project tooling.

Native WSL `rg` may be unavailable in this environment, while a Windows-injected `rg` path may appear but fail with permission errors. If `rg` is not usable inside WSL, use `find`, `grep`, `sed`, and `git grep` instead.

Do not commit personal machine paths, usernames, local absolute home directories, secrets, tokens, or private environment values to assistant guidance files.

## Common Commands

Run commands from the repository root.

```bash
npm run build
npm run check
npm run lint
npm run format
npm run test:unit:run
npm run test:integration
npm run db:generate
npm run db:deploy
```

Prefer the smallest meaningful verification for the change. For most service or utility edits, start with focused unit tests and `npm run build`; broaden to `npm run check` or integration tests when behavior crosses API, database, route, Prisma, or Docker-backed boundaries.

Integration tests start Docker Compose services, deploy migrations against `.env.test`, run Vitest with `vitest.config.integration.ts`, and tear services down. They are heavier than unit tests, so run them when the touched behavior needs database-backed coverage.

## Code Style

Follow the existing TypeScript style and module boundaries:

- Controllers translate HTTP input/output and delegate business logic.
- Services contain domain behavior.
- Prisma access belongs behind the existing Prisma client/config patterns.
- Routes are registered through `src/routes`.
- OpenAPI changes live in `src/docs/openApi.ts`.
- Locale-facing text should keep `src/locales/en.json` and `src/locales/pt.json` aligned.

Use existing helpers and local patterns before adding abstractions. Keep comments sparse and only add them where they explain non-obvious behavior.

## Tests

Unit tests live under `__tests__/unit` and integration tests live under `__tests__/integration`.

When adding or changing behavior, add or adjust tests close to the affected code. Do not rewrite broad test fixtures unless the task requires it.

## Git And Commits

Do not revert or overwrite user changes. Check `git status --short` before editing when possible, and treat unexpected local changes as user-owned.

When asked to commit, follow `.github/git-commit-instructions.md`: if the branch name starts with an integer issue id, prefix the commit message with that id, then use a type such as `Doc`, `Add`, `Fix`, or `Refactor`.

## Communication

Be concise and concrete. Do not provide confidence percentages for every factual statement or code operation unless the user explicitly asks for them.
