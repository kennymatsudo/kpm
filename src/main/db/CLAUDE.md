# Database Layer

Owns database schema, migrations, repositories (data access), and domain services (complex multi-table transactions).

## Document storage

Markdown documents live as files on disk in the project folder. There is no DB-backed document store. `PlanItem.source_document_id` is a free-form text breadcrumb (no FK); the plan-refs feature uses `@plan/<uuid>` tokens for first-class cross-references. Claude's `propose_document_create` and `propose_document_edit` tools write files directly.

## Directory Structure

```
src/main/db/
├── connection.ts              # Database initialization & pragmas
├── migrations.ts              # Schema versioning (never modify after deploy)
├── container.ts               # DI container for repositories
├── interfaces/                # Repository & container type definitions
├── repositories/
│   └── impl/                  # Concrete repository classes
└── domain/                    # Domain services for multi-table transactions
```

## Schema Evolution

Schema lives in `connection.ts` (initial tables) and `migrations.ts`.

**New install:** Gets full schema + migrations applied.

### Adding a Column


```typescript
{
  up: (db: BetterSqliteDatabase) => {
    db.exec(`ALTER TABLE plan_items ADD COLUMN example_data TEXT;`);
  },
}
```

2. Push migration to array (order matters).
3. Migrations run automatically on next app start.

### Critical Rule

**Once a migration is deployed, NEVER modify it.** Create a new one instead.

### Table Recreation (DROP/RENAME) - CRITICAL

When recreating a table (e.g., to drop a column), you MUST disable foreign keys first. Otherwise, `DROP TABLE` will trigger `ON DELETE CASCADE` on all referencing tables:

```typescript
// CORRECT: Disable FK constraints during table recreation
db.exec(`
  PRAGMA foreign_keys = OFF;

  CREATE TABLE foo_new (...);
  INSERT INTO foo_new SELECT ... FROM foo;
  DROP TABLE foo;
  ALTER TABLE foo_new RENAME TO foo;

  PRAGMA foreign_keys = ON;
`);

// WRONG: This will CASCADE DELETE all referencing rows!
db.exec(`
  CREATE TABLE foo_new (...);
  INSERT INTO foo_new SELECT ... FROM foo;
  DROP TABLE foo;  -- ⚠️ Triggers ON DELETE CASCADE!
  ALTER TABLE foo_new RENAME TO foo;
`);
```

## Repository Pattern

Follow the pattern in `PlanItemRepository.ts` for new repositories. See `../services/CLAUDE.md` for service vs repository guidance.

### Adding a New Repository

1. Create interface in `interfaces/{domain}.ts`
2. Implement class in `repositories/impl/FooRepository.ts`
3. Add to `IRepositoryContainer` in `interfaces/container.ts`
4. Wire in container (`container.ts`) — add the implementation to the `createRepositoryContainer` function
5. Export the class from `repositories/impl/index.ts` (the barrel `container.ts` imports from)

## SQL Performance Rules

**ALWAYS follow these rules when writing SQL queries:**

### 1. Cache Prepared Statements

Every repository MUST cache prepared statements in the constructor — declare a `PreparedStatements` interface and populate it in `constructor(private db: Database)`. **NEVER** call `db.prepare()` inside a method body (except for dynamic IN clauses). See `PlanItemRepository.ts` for the canonical shape.

### 2. Use RETURNING Clause

ALWAYS use `RETURNING *` on INSERT to get the inserted row in one query instead of a follow-up SELECT.

### 3. Use ON CONFLICT for Upserts

NEVER check existence before insert/update. Use `INSERT ... ON CONFLICT(id) DO UPDATE SET ... RETURNING *` in a single prepared statement.

### 4. Use EXISTS for Existence Checks

NEVER use `COUNT(*)` when you only need to check if rows exist. Use `SELECT EXISTS (SELECT 1 FROM ... LIMIT 1) as exists_flag` — it short-circuits at the first match.

### 5. Combine Sequential Queries

If you find yourself running 2+ queries that could be combined, use a single query with priority ordering (`ORDER BY CASE WHEN ... END LIMIT 1`) rather than sequential calls with fallback logic.

### 6. Index Guidelines

- Add indexes for columns used in WHERE clauses
- Create composite indexes for `WHERE col1 = ? ORDER BY col2` patterns
- Use partial indexes for sparse columns: `WHERE external_key IS NOT NULL`
- Check existing indexes in `migrations.ts` before adding duplicates

### 7. Dynamic IN Clauses

Dynamic `IN (?)` clauses are acceptable since they can't be pre-prepared:

```typescript
// Acceptable: Variable-length IN clause
getMany(ids: string[]): Item[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const stmt = this.db.prepare(`SELECT * FROM items WHERE id IN (${placeholders})`);
  return stmt.all(...ids) as Item[];
}
```

### 8. JSON-Encoded Array Columns

String arrays (e.g., `code_refs`, `acceptance_criteria` on `plan_items`) are stored as JSON TEXT and parsed at read time. Use the `parseStringArray` helper in `PlanItemRepository.ts` — it defensively returns `null` on parse failure or non-array values. Write with `JSON.stringify(value)`; never concatenate or semicolon-delimit. Loose cross-table references (e.g., `source_document_id`) are stored as plain TEXT **without** a foreign key so the referenced row can be renamed/deleted without cascading.

### 9. Batch Operations

Use `db.transaction()` for bulk operations — wrap a loop over prepared statements inside a transaction function.

## Key Design Decisions

1. **Prepared statements cache** — Hot paths pre-compile SQL
2. **RETURNING clause** — Avoid re-query after INSERT
3. **ON CONFLICT upserts** — Single query instead of check + insert/update
4. **EXISTS over COUNT** — Short-circuit existence checks
5. **Recursive CTEs** — Hierarchical queries use SQL `WITH RECURSIVE`
6. **Constructor-injected repositories** — Each repository takes the `Database` (and any deps) as constructor params; `createRepositoryContainer` wires them eagerly, so tests can inject a mock database without refactoring
7. **DI for complex services** — Business logic accepts dependencies
8. **Foreign key constraints** — `ON DELETE CASCADE` cleans up related rows

## Discovering Repositories and Services

All repositories live in `repositories/impl/`. Domain services live in `domain/`. Read the source files to see the full list — avoid hardcoding counts in documentation.
