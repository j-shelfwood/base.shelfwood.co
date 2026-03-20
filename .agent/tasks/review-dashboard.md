# Task: Review TimescaleDB Migration Plan — Dashboard (base.shelfwood.co)

## Objective
Review the TimescaleDB migration plan against the actual dashboard codebase. Identify gaps, issues, or improvements needed. Be specific and critical.

## The Plan (summary)
We're migrating from InfluxDB 2.7 (Flux queries) to TimescaleDB (PostgreSQL extension).

**Target architecture:**
```
[CC:Tweaked Lua] → HTTP POST (InfluxDB line protocol) → [Bun ingestion API] → [TimescaleDB] → [Astro SSR dashboard]
```

**Dashboard changes:**
- Replace `src/lib/influxdb.ts` InfluxDB client with `postgres` (postgres.js)
- Rewrite all Flux queries in `src/lib/queries/` to SQL
- Add `src/lib/db.ts` connection module
- Remove InfluxDB env vars, add `DATABASE_URL`

## Your Task

### 1. Discover the full query surface
```bash
tree --gitignore -L 3
cat src/lib/influxdb.ts 2>/dev/null || cat src/lib/influx*.ts 2>/dev/null
ls src/lib/queries/
cat src/lib/queries/*.ts
ls src/pages/api/
cat src/pages/api/*.ts
```

### 2. Analyze each query file
For every Flux query in `src/lib/queries/`:
- What measurement does it read?
- What tags/fields does it use?
- What time range pattern? (last(), range(), window())
- What aggregation? (mean, sum, count, last)
- Is there a `withHistoryFallback` pattern that needs rethinking?

### 3. Map to SQL equivalents
For each query, write the equivalent SQL using TimescaleDB features:
- `time_bucket()` for windowed aggregations
- `DISTINCT ON (tag) ORDER BY time DESC` for last-value queries
- Standard WHERE time >= NOW() - INTERVAL for range queries

### 4. Identify blockers or complications
- Any queries that are hard to express in SQL?
- Connection pooling — Astro SSR spawns per-request, does postgres.js handle this?
- Env var changes needed
- Any TypeScript type changes needed for the response shape?

### 5. Proposed `src/lib/db.ts`
Write the actual module — postgres.js singleton with proper pool config for SSR.

## Output
Output a complete review directly in chat as structured markdown. Include:
- Full list of queries to migrate with before/after (Flux → SQL) for each
- Any blockers found
- Proposed `src/lib/db.ts` module code
- Estimated migration effort per file

Do NOT write to any files. Do NOT commit anything.
