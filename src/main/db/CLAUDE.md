# Database Layer

Owns database schema, migrations, repositories (data access), and domain services (complex multi-table transactions).

## Directory Structure

```
src/main/db/
├── connection.ts              # Database initialization & pragmas
├── container.ts               # DI container for repositories
├── interfaces/                # Repository & container type definitions
├── repositories/
```

## Schema Evolution


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

## Repository Pattern


### Adding a New Repository

1. Create interface in `interfaces/{domain}.ts`
2. Implement class in `repositories/impl/FooRepository.ts`
3. Add to `IRepositoryContainer` in `interfaces/container.ts`

## SQL Performance Rules

**ALWAYS follow these rules when writing SQL queries:**

### 1. Cache Prepared Statements


### 2. Use RETURNING Clause


### 3. Use ON CONFLICT for Upserts


### 4. Use EXISTS for Existence Checks


### 5. Combine Sequential Queries


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



## Key Design Decisions

1. **Prepared statements cache** — Hot paths pre-compile SQL
2. **RETURNING clause** — Avoid re-query after INSERT
3. **ON CONFLICT upserts** — Single query instead of check + insert/update
4. **EXISTS over COUNT** — Short-circuit existence checks
5. **Recursive CTEs** — Hierarchical queries use SQL `WITH RECURSIVE`
7. **DI for complex services** — Business logic accepts dependencies
8. **Foreign key constraints** — `ON DELETE CASCADE` cleans up related rows

