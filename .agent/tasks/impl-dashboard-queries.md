# Task: Migrate Dashboard Queries from Flux → SQL (TimescaleDB)

## Objective
Replace all InfluxDB/Flux query code in `src/lib/queries/` with SQL queries using `postgres` (postgres.js). The TimescaleDB schema is already live at the connection string in `.env`. Do NOT touch any component files, API routes, or anything outside `src/lib/`.

## Context
- TimescaleDB is running at `DATABASE_URL` (will be set in `.env`)
- All hypertable schemas are defined — column names match exactly what the Lua collectors write
- The existing InfluxDB client is at `src/lib/influxdb.ts`

## Step 1: Read the current codebase
```bash
tree --gitignore -L 4
cat src/lib/influxdb.ts
cat src/lib/queries/shared.ts
cat src/lib/queries/machines.ts
cat src/lib/queries/energy.ts
cat src/lib/queries/ae.ts
cat src/lib/queries/crafting.ts
cat .env 2>/dev/null | grep -v TOKEN | grep -v PASSWORD || true
cat astro.config.mjs
```

## Step 2: Create `src/lib/db.ts`
Create a postgres.js singleton. This file replaces `src/lib/influxdb.ts` for all new queries:

```typescript
import postgres from 'postgres';

const DATABASE_URL = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
```

## Step 3: Update `package.json`
Add `postgres` dependency: `bun add postgres` or add `"postgres": "^3.4.4"` to dependencies.

## Step 4: Add `DATABASE_URL` to astro env schema
In `astro.config.mjs`, add `DATABASE_URL` to the env schema (server-side secret), following the same pattern as the existing `INFLUX_*` vars.

## Step 5: Rewrite each query file

### Key schema facts (actual column names from TimescaleDB):
- `machine_activity`: `time, node, name, mod, type, active, progress, recipe_progress, energy_use`
- `machine_type`: `time, node, mod, type, count`
- `machine_summary`: `time, node, active, total`
- `mi_machine_slot`: `time, node, name, mod, slot, item, count, max_count`
- `mi_machine_fluid`: `time, node, name, mod, tank, fluid, amount, capacity`
- `mi_machine_input`: `time, node, name, mod, slot, item, count`
- `energy_total`: `time, node, stored_fe, capacity_fe, percent`
- `energy_storage`: `time, node, name, category, stored_fe, capacity_fe, percent`
- `energy_flow`: `time, node, name, eu_in, eu_out, avg_eu_in, avg_eu_out, net_eu`
- `ae_summary`: `time, node, source, items, types, fluids, chemicals, cpu_total, cpu_busy, task_count`
- `ae_item`: `time, node, source, item, count, craftable`
- `ae_fluid`: `time, node, source, fluid, amount`
- `ae_crafting_job`: `time, node, source, item, cpu, cpu_index, quantity, crafted, completion`
- `ae_crafting_task`: `time, node, source, count`

### SQL patterns to use:
- **Last value per entity**: `DISTINCT ON (node, name) ... ORDER BY node, name, time DESC`
- **Windowed aggregation**: `time_bucket('1 minute', time)` (TimescaleDB function)
- **Range**: `WHERE time >= NOW() - $1::interval` with param like `'1 hour'`
- **Active machines**: `WHERE active = 1 AND time >= NOW() - INTERVAL '2 minutes'`

### For each query file, rewrite it completely:
- Remove all Flux imports
- Import `sql` from `../db`
- Keep the same exported function signatures and return types that the API routes expect
- Remove `withHistoryFallback` — just query the range directly (TimescaleDB won't have gaps)
- Handle the range parameter: convert `-1h` → `'1 hour'`, `-24h` → `'24 hours'`, etc. Write a `parseRangeInterval(range: string): string` helper

### Range parameter conversion:
```typescript
function parseRangeInterval(range: string): string {
  const match = range.match(/^-(\d+)([smhd])$/);
  if (!match) return '1 hour';
  const n = match[1];
  const units: Record<string, string> = { s: 'seconds', m: 'minutes', h: 'hours', d: 'days' };
  return `${n} ${units[match[2]!]}`;
}
```

## Step 6: Update `.env` and `.env.example`
Add `DATABASE_URL=postgres://mctelemetry:<password>@<host>:5432/mc_telemetry`

For now, add it as a placeholder that can be filled in — do NOT hardcode real credentials.

## Important constraints
- Keep ALL exported function names and return shapes identical — API routes must not need to change
- Do NOT modify any files in `src/pages/` or `src/components/`
- Do NOT remove the existing `src/lib/influxdb.ts` — leave it in place (we'll remove it after cutover)
- The old Flux query files should be renamed to `*.flux.ts` as backup, not deleted
- Write new SQL versions as the primary files (replacing the old ones)

## Output
Output summary in chat:
- Files created/modified
- Any return type changes needed
- Any API route changes that WILL be needed (note them, don't make them)
- Whether `bun install` succeeded

Do NOT commit. Do NOT modify API routes.
