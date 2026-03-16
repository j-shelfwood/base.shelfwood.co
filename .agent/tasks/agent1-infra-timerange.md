# Task: Time Range Infrastructure + New API Endpoints

## Objective
Add a global time range selector component and expand the API layer to support:
1. Parameterised range on all existing endpoints
2. New endpoints for fluids, chemicals, energy storage breakdown
3. New history query functions in queries.ts

## Project Structure
```bash
tree --gitignore -L 3
```

## Context
This is an Astro SSR dashboard for a Minecraft base. Data comes from InfluxDB via `src/lib/queries.ts`.
The InfluxDB `mc` bucket has these measurements relevant to new endpoints:
- `ae_fluid` — fields: `amount`, tags: `fluid`, `node`
- `ae_chemical` — fields: `amount`, tags: `chemical`, `node`
- `inventory_fluid` — same schema as ae_fluid
- `inventory_chemical` — same schema as ae_chemical
- `energy_storage` — fields: `stored_fe`, `capacity_fe`, `percent`, tags: `name`, `type`, `storage`, `node`
- `ae_crafting_task` — field: `count`, tags: `node`, `source`

Current API endpoints: `/api/energy`, `/api/ae-items`, `/api/ae-summary`, `/api/crafting`, `/api/machines`, `/api/history`

## Discovery
```bash
cat src/lib/queries.ts
cat src/pages/api/history.ts
cat src/pages/api/energy.ts
cat src/pages/api/ae-summary.ts
cat src/pages/api/crafting.ts
```

## Implementation

### 1. Add new query functions to `src/lib/queries.ts`

Add after existing functions:

```typescript
// ── Fluids ────────────────────────────────────────────────────────────────────
export interface AEFluid {
  fluid: string;
  amount: number;
}

export async function aeFluids(): Promise<AEFluid[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount")
  |> last()
  |> sort(columns: ["_value"], desc: true)
`);
  return rows.map(r => ({
    fluid: String(r.fluid ?? ''),
    amount: (r._value as number) ?? 0,
  }));
}

export async function aeFluidHistory(fluid: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount" and r.fluid == "${fluid}")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

export async function aeFluidVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  const [firstRows, lastRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount")
  |> first()
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount")
  |> last()
`),
  ]);
  const firstMap = new Map<string, number>();
  for (const r of firstRows) firstMap.set(String(r.fluid ?? ''), (r._value as number) ?? 0);
  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.fluid ?? '');
    const last = (r._value as number) ?? 0;
    const first = firstMap.get(item) ?? last;
    const delta = last - first;
    if (Math.abs(delta) > 0) results.push({ item, delta, first, last });
  }
  return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}

// ── Chemicals ─────────────────────────────────────────────────────────────────
export interface AEChemical {
  chemical: string;
  amount: number;
}

export async function aeChemicals(): Promise<AEChemical[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount")
  |> last()
  |> sort(columns: ["_value"], desc: true)
`);
  return rows.map(r => ({
    chemical: String(r.chemical ?? ''),
    amount: (r._value as number) ?? 0,
  }));
}

export async function aeChemicalHistory(chemical: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount" and r.chemical == "${chemical}")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

export async function aeChemicalVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  const [firstRows, lastRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount")
  |> first()
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount")
  |> last()
`),
  ]);
  const firstMap = new Map<string, number>();
  for (const r of firstRows) firstMap.set(String(r.chemical ?? ''), (r._value as number) ?? 0);
  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.chemical ?? '');
    const last = (r._value as number) ?? 0;
    const first = firstMap.get(item) ?? last;
    const delta = last - first;
    if (Math.abs(delta) > 0) results.push({ item, delta, first, last });
  }
  return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}

// ── Energy Storage Breakdown ──────────────────────────────────────────────────
export interface EnergyDevice {
  name: string;
  type: string;
  storage: string;
  stored_fe: number;
  capacity_fe: number;
  percent: number;
}

export async function energyDevices(): Promise<EnergyDevice[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_storage")
  |> filter(fn: (r) => r._field == "stored_fe" or r._field == "capacity_fe" or r._field == "percent")
  |> group(columns: ["name", "type", "storage", "node", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "name", "type", "storage", "node"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows.map(r => ({
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    storage: String(r.storage ?? ''),
    stored_fe: (r.stored_fe as number) ?? 0,
    capacity_fe: (r.capacity_fe as number) ?? 0,
    percent: (r.percent as number) ?? 0,
  })).sort((a, b) => b.capacity_fe - a.capacity_fe);
}

export async function energyDeviceHistory(name: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_storage" and r._field == "percent" and r.name == "${name}")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

// ── Crafting task queue depth ─────────────────────────────────────────────────
export async function craftingTaskCount(): Promise<number> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -10m)
  |> filter(fn: (r) => r._measurement == "ae_crafting_task" and r._field == "count")
  |> last()
`);
  if (rows.length === 0) return 0;
  return (rows[0]?._value as number) ?? 0;
}

export async function craftingTaskHistory(range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_crafting_task" and r._field == "count")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

// ── Machine activity history ───────────────────────────────────────────────────
export async function machineActivityHistory(range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "machine_summary" and r._field == "active_machines")
  |> group(columns: ["node", "_field"])
  |> aggregateWindow(every: 1m, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

// ── Item history (parameterised range) ────────────────────────────────────────
// aeItemHistory already exists — it accepts range param, no change needed
```

### 2. Create `/api/fluids.ts`

```typescript
import type { APIRoute } from 'astro';
import { aeFluids, aeFluidVelocity, aeFluidHistory } from '@/lib/queries';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const velocity = url.searchParams.get('velocity') === '1';
    const historyFluid = url.searchParams.get('history');
    const range = url.searchParams.get('range') ?? '-30m';

    if (historyFluid) {
      const data = await aeFluidHistory(historyFluid, range);
      return new Response(JSON.stringify({ history: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (velocity) {
      const data = await aeFluidVelocity(range);
      return new Response(JSON.stringify({ velocity: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fluids = await aeFluids();
    return new Response(JSON.stringify({ fluids }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

### 3. Create `/api/chemicals.ts`

Same pattern as fluids.ts but using `aeChemicals`, `aeChemicalVelocity`, `aeChemicalHistory`.
Parameter: `?history=<chemical>`, `?velocity=1`, `?range=<range>`.

### 4. Create `/api/energy-storage.ts`

```typescript
import type { APIRoute } from 'astro';
import { energyDevices, energyDeviceHistory } from '@/lib/queries';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const historyName = url.searchParams.get('history');
    const range = url.searchParams.get('range') ?? '-1h';

    if (historyName) {
      const data = await energyDeviceHistory(historyName, range);
      return new Response(JSON.stringify({ history: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const devices = await energyDevices();
    return new Response(JSON.stringify({ devices }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

### 5. Update `/api/history.ts` to accept `?range=` param

Read the current history.ts. If it has hardcoded range values, add a `range` query param (default `-1h`) and pass it through to energyHistory and energyFlowHistory.

### 6. Update `/api/crafting.ts` to include task count

Add `craftingTaskCount()` to the existing parallel fetch and include `taskCount` in the JSON response.

### 7. Update `/api/machines.ts` to include machine activity history

Add `machineActivityHistory()` to the fetch and include `activityHistory` in JSON response.

## Output
After all changes are made, output a summary to chat:
- List of files modified/created
- Any issues encountered
- TypeScript errors if any (run: cd /Users/shelfwood/Projects/base.shelfwood.co && npx tsc --noEmit 2>&1 | head -30)

Do NOT commit anything.
