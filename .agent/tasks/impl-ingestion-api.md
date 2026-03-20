# Task: Build Bun Ingestion API

## Objective
Create a new directory `/Users/shelfwood/Projects/mc-ingest/` containing a Bun HTTP server that accepts InfluxDB line protocol and writes to TimescaleDB. This is a brand new project — create all files from scratch.

## What it must do
- Accept `POST /api/v2/write?org=shelfwood&bucket=mc&precision=ms`
- Header: `Authorization: Token <token>` — validate against env var `INGEST_TOKEN`
- Body: InfluxDB line protocol (newline-separated)
- Parse each line, batch-insert into TimescaleDB
- Return HTTP 204 on success, 401 on bad token, 500 on error
- Health check: `GET /health` → 200 `{"ok":true}`

## Line Protocol Format
Lines look like:
```
machine_activity,mod=mekanism,name=Electric\ Furnace,node=cc-49,type=electric_furnace active=1,progress=0 1742338800000
energy_total,node=cc-58 eu=12345,rf=49380 1742338800000
ae_item,item=minecraft:iron_ingot,node=cc-49 count=1024 1742338800000
```
Format: `measurement[,tag=val...] field=val[,field=val...] [timestamp_ms]`

## TimescaleDB Schema
The DB will have these hypertables (already created by the schema migration). The ingestion API must route each measurement to the correct table. Use a routing map:

```typescript
const TABLE_MAP: Record<string, string> = {
  machine_activity: 'machine_activity',
  machine_type: 'machine_type',
  machine_summary: 'machine_summary',
  mi_machine_slot: 'mi_machine_slot',
  mi_machine_fluid: 'mi_machine_fluid',
  mi_machine_input: 'mi_machine_input',
  energy_total: 'energy_total',
  energy_storage: 'energy_storage',
  energy_flow: 'energy_flow',
  ae_item: 'ae_item',
  ae_fluid: 'ae_fluid',
  ae_cpu: 'ae_cpu',
  ae_job: 'ae_job',
  ae_summary: 'ae_summary',
};
```

Unknown measurements → log and skip (no crash).

## Schema for each table (columns to insert)
Each table has `time TIMESTAMPTZ` + tag columns + field columns. Insert only the columns present in the line protocol line. Use `INSERT ... ON CONFLICT DO NOTHING`.

Key tables:
- `machine_activity(time, node, name, mod, type, active, progress, recipe_progress, energy_use)`
- `machine_type(time, node, mod, type, count)`
- `machine_summary(time, node, active, total)`
- `energy_total(time, node, eu, rf, j)`
- `energy_storage(time, node, name, category, stored, max, pct)`
- `energy_flow(time, node, name, eu_in, eu_out, rf_in, rf_out)`
- `ae_item(time, node, item, count, craftable)`
- `ae_fluid(time, node, fluid, amount)`
- `ae_cpu(time, node, name, busy, storage, coprocessors)`
- `ae_job(time, node, item, amount, progress)`
- `ae_summary(time, node, items, types, fluids, cpus, busy_cpus)`
- `mi_machine_slot(time, node, name, mod, slot, item, count, max_count)`
- `mi_machine_fluid(time, node, name, mod, tank, fluid, amount, capacity)`
- `mi_machine_input(time, node, name, mod, slot, item, count)`

## Implementation

### `/Users/shelfwood/Projects/mc-ingest/src/server.ts`
```typescript
import { serve } from 'bun';
import { sql } from './db';
import { parseLineProtocol, insertBatch } from './ingest';

const INGEST_TOKEN = process.env.INGEST_TOKEN ?? '';
const PORT = parseInt(process.env.PORT ?? '3000');

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/v2/write') {
      const auth = req.headers.get('Authorization') ?? '';
      if (INGEST_TOKEN && auth !== `Token ${INGEST_TOKEN}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      const body = await req.text();
      const lines = parseLineProtocol(body);
      await insertBatch(lines);
      return new Response(null, { status: 204 });
    }

    return new Response('Not Found', { status: 404 });
  },
  error(err) {
    console.error('Server error:', err);
    return new Response('Internal Server Error', { status: 500 });
  },
});

console.log(`mc-ingest listening on :${PORT}`);
```

### `/Users/shelfwood/Projects/mc-ingest/src/db.ts`
Use `postgres` (postgres.js):
```typescript
import postgres from 'postgres';
export const sql = postgres(process.env.DATABASE_URL!, { max: 10 });
```

### `/Users/shelfwood/Projects/mc-ingest/src/ingest.ts`
Write a line protocol parser and batch inserter. The parser must handle:
- Escaped spaces/commas in tag values (`\ ` and `\,`)
- Integer vs float field values (InfluxDB uses `1i` for int, plain number for float)
- Missing timestamp (use `Date.now()`)
- Skip lines starting with `#` (comments)

The batch inserter must:
- Group parsed lines by measurement
- For each measurement in TABLE_MAP, build one `INSERT` per group
- Use `sql.unsafe()` with a validated table name from TABLE_MAP
- Insert columns dynamically based on what fields/tags are present

### `/Users/shelfwood/Projects/mc-ingest/Dockerfile`
```dockerfile
FROM oven/bun:1-alpine
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY src/ ./src/
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "src/server.ts"]
```

### `/Users/shelfwood/Projects/mc-ingest/package.json`
```json
{
  "name": "mc-ingest",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "bun src/server.ts",
    "dev": "bun --watch src/server.ts"
  },
  "dependencies": {
    "postgres": "^3.4.4"
  }
}
```

## Your Task
1. Create the directory `/Users/shelfwood/Projects/mc-ingest/`
2. Create all files above with full, working implementations
3. Make the line protocol parser robust (handle edge cases)
4. Make the batch inserter handle partial fields gracefully (NULL for missing columns)
5. Run `bun install` to generate lockfile if bun is available

## Output
Output summary in chat:
- Files created
- Any design decisions made
- Any edge cases handled
- Whether `bun install` succeeded

Do NOT commit anything.
