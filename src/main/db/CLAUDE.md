# Database Layer

One SQLite file (`planner.db` in Electron's `userData`), accessed synchronously through better-sqlite3. This folder owns the schema (`migrations.ts`), the repositories that do all data access (`repositories/impl/`), the container that wires them (`container.ts`), and the domain services that run multi-table transactions (`domain/`).

Markdown documents are files on disk in the project folder, not rows. `plan_items.source_document_id` is plain TEXT with no foreign key; cross-references use `@plan/<uuid>` tokens.

## How it fits together

- `connection.ts`: `initDatabase()` opens the file, applies pragmas from `getConfig().database` (WAL, `synchronous`, `foreign_keys = ON`), then calls `runMigrations`. `getDatabase()` returns the handle.
- `migrations.ts`: the entire schema. A fresh install runs every migration from `001_initial_schema`; there is no separate base schema.
- `container.ts`: `createRepositoryContainer({ database, userDataPath, ... })` builds every repository eagerly. `main.ts` calls `initializeRepositoryContainer()` once; `createAppServices(container)` in `src/main/services/appServices.ts` hands it to services, and IPC handlers reach it as `services.container.<repo>`.
- `interfaces/`: one `I{Name}Repository` per repository, grouped by domain file, re-exported from `interfaces/index.ts`. `IRepositoryContainer` lives in `interfaces/container.ts`.
- `domain/`: factory functions (`createPlanActionExecutor(deps)`, `createSyncService(deps)`, ...) that take repositories and the `database` as explicit dependencies and wrap multi-table writes in one transaction. Exported from `domain/index.ts`.
- `appSettingsAccess.ts`: typed `getSetting` / `setSetting` over the `app_settings` key-value table, driven by `src/shared/settingsRegistry.ts`. Use it instead of raw keys.

## Recipe: add a migration

1. Append an object to the end of the `migrations` array in `migrations.ts`. Order in the array is run order.
2. Take the next number after the last entry: `id: 1000 + N`, `name: 'NNN_short_description'` (e.g. after `1125` / `125_...` comes `1126` / `126_...`). `id` is the primary key and `name` is unique; applied state is looked up by `name`. Skip gaps; never reuse a number.
3. Write `up(db)` with `db.exec` for DDL, and `db.prepare(...).run(...)` for data backfills.
4. Add a test to `migrations.test.ts` if the migration moves or reshapes data (see below).

The migration runs on the next app start. The model:

- `runMigrations` wraps each migration's `up` and its bookkeeping row in one `db.transaction()`. A throw rolls back that migration only; earlier ones stay applied.
- Before applying pending migrations to a database that already has history, it checkpoints the WAL and copies the file to `planner.db.bak`. This is a single rolling copy, overwritten by the next migration run.

### Migration rules

- **Never edit a migration that has shipped.** Users' databases have already recorded it as applied, so an edit only reaches fresh installs and splits the schema. Fix forward with a new migration.
- **Prefer in-place `ALTER TABLE`** (`ADD COLUMN`, `RENAME COLUMN`, `DROP COLUMN`) over recreating a table. Drop any index on a column before dropping the column, or SQLite fails the statement.
- **`PRAGMA foreign_keys = OFF` does nothing inside a migration.** SQLite ignores that pragma inside a transaction, and every `up` runs in one. So `DROP TABLE` on a table that other tables reference with `ON DELETE CASCADE` deletes those child rows, even if the migration "turns foreign keys off" first. Some older migrations still contain that pattern; do not copy it. Dropping a table nothing references (a leaf table) is safe. If you truly need to rebuild a parent table, change the runner first so foreign keys are switched off outside the transaction and `PRAGMA foreign_key_check` runs afterwards. Migrations 056 and 125 explain why they avoided a rebuild.
- **Guard FTS5.** `global_search_index` / `global_search_fts` only exist where SQLite has FTS5, and the test SQLite does not. A migration that touches them must check first (see the guards in migrations 040 and later).
- **Keep migrations self-contained.** Don't import app code whose behaviour may change later. Freeze literal values inside the migration instead (see `124_backfill_playbook_snapshot`).

## Recipe: add a table with a repository

1. Migration: `CREATE TABLE IF NOT EXISTS ...` with `REFERENCES projects(id) ON DELETE CASCADE` (or the relevant parent) so deleting the parent cleans up, plus indexes for the queries you will run.
2. Interface: add `I{Name}Repository` to the matching file in `interfaces/` (or a new one) and export it from `interfaces/index.ts`.
3. Implementation: `repositories/impl/{Name}Repository.ts`, exported from `repositories/impl/index.ts`. `ProjectWriteGrantRepository.ts` is a small complete example; `PlanItemRepository.ts` is the large one.
4. Add the property to `IRepositoryContainer` (`interfaces/container.ts`) and construct it in `createRepositoryContainer` (`container.ts`).
5. Test it against a real in-memory database (see Testing).

Plan item columns are different: follow the root `CLAUDE.md` recipe "Add a plan item field", because `src/shared/planItemFields.ts` generates `PlanItemRepository`'s insert and update SQL.

## Recipe: add a domain service

Put logic in `domain/` when it must write several tables atomically or is tightly bound to SQL. Otherwise it belongs in `src/main/services/`.

1. Export `create{Name}(deps: {Name}Deps)`. `deps` lists the repository interfaces (narrowed with `Pick<>` where possible) and `database: Database` if you need a transaction.
2. Wrap the writes in `deps.database.transaction(() => { ... })()`.
3. Export it from `domain/index.ts` and wire it in `createAppServices` (`src/main/services/appServices.ts`).

## Repository conventions

- **Prepare statements once**, in the constructor, into a private `PreparedStatements` object. Only statements whose SQL text changes per call, such as a variable-length `IN (?, ?, ...)`, are prepared inside methods.
- `INSERT ... RETURNING *` instead of insert-then-select. `INSERT ... ON CONFLICT(...) DO UPDATE` (or `DO NOTHING`) instead of check-then-write.
- `SELECT EXISTS (SELECT 1 ... LIMIT 1)` for existence checks, not `COUNT(*)`.
- Loop writes inside `db.transaction()`. Trees use `WITH RECURSIVE` (see `getDescendantIds` in `PlanItemRepository`).
- String arrays are stored as JSON TEXT: write with `JSON.stringify`, read with `PlanItemRepository`'s `parseStringArray`, which returns `null` for bad data.
- Check `migrations.ts` for an existing index before adding one; use partial indexes (`WHERE col IS NOT NULL`) for sparse columns.
- Repositories return typed data (or `undefined` when a row is missing) and hold no business rules. `ServiceResult<T>` belongs to services, not this folder.

## better-sqlite3 gotchas

- **Everything is synchronous.** A query blocks the main process until it finishes, so keep queries indexed and small.
- **A transaction function cannot be async.** better-sqlite3 throws if the function returns a promise. Do network or file I/O first, then apply the results in one synchronous transaction (as `SyncService` does with preview, then apply).
- **Nesting.** `db.transaction()` nests on the real driver but not in the test double. Code that must work both standalone and inside another transaction uses a raw `SAVEPOINT` (see `PlanItemRemoval.ts`).

## Testing

`npm test` never loads native better-sqlite3. `tests/setup.ts` replaces it with a sql.js (WASM SQLite) adapter (`tests/mocks/sqljs-adapter.ts`), so `new BetterSqlite3(':memory:')` in a test gets sql.js. That has consequences:

- **No FTS5.** Search-table migrations are skipped. Gate FTS-dependent tests with `sqliteHasFts5()` from `testing/createTestDb.ts`.
- **Foreign keys depend on the helper.** `createTestRepositoryContext()` (`tests/factories.ts`) and `createTestDatabase()` (`tests/mocks/database.ts`) turn `foreign_keys` on, as production does. `createTestDb()` (`testing/createTestDb.ts`) and a bare `new BetterSqlite3(':memory:')` leave it off, so cascades don't fire. Set `db.pragma('foreign_keys = ON')` whenever cascades matter.
- **Transactions don't nest** (see above).

Repository tests use `createTestRepositoryContext()` for a migrated database plus a real container (see `tests/repositories/` and `repositories/impl/*.test.ts`).

For a migration test, migrate to just before the new one, seed rows as they existed then, run the new migration's `up`, and assert the data survived and `PRAGMA foreign_key_check` returns nothing. The `125_drop_canvas_positions_and_groups` block in `migrations.test.ts` is the template.

Because the test SQLite is not the shipped SQLite, verify a destructive migration against a copy of a real database too. Copy `planner.db` from `~/Library/Application Support/KPM - Planning Workbench/` to a temp path, run the migration against the copy with `foreign_keys = ON`, and diff the tables you expected to be untouched. Never point this at the live file.
