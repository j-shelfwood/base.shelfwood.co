# Task: Fix craftingCpuHistory + Add Crafting Throughput History

## Problem

`craftingCpuHistory` in `src/lib/queries.ts` (line 630) queries `r._field == "busy_percent"` — this field does NOT exist in InfluxDB. The `ae_crafting_cpu` measurement only stores `total` and `busy` fields (confirmed from `aeCPUs()` at line 259 which pivots both fields). The chart renders empty because no rows are returned.

## Fix 1 — craftingCpuHistory query (src/lib/queries.ts ~line 630)

Replace the broken query with one that computes busy_percent via Flux map:

```typescript
export async function craftingCpuHistory(range = '-1h'): Promise<TimePoint[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_crafting_cpu" and (r._field == "busy" or r._field == "total"))
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> pivot(rowKey: ["_time", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
  |> map(fn: (r) => ({
      _time: r._time,
      _value: if r.total > 0 then float(v: r.busy) / float(v: r.total) * 100.0 else 0.0,
    }))
  |> group(columns: ["_time"])
  |> mean()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

## Fix 2 — machineActivityHistory adaptive window (src/lib/queries.ts ~line 806)

Currently hardcoded to `1m` window. Replace with adaptive window:

```typescript
export async function machineActivityHistory(range = '-1h'): Promise<TimePoint[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "machine_summary" and r._field == "active_machines")
  |> group(columns: ["node", "_field"])
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

## Fix 3 — Add machineActivePercentHistory (src/lib/queries.ts, after machineActivityHistory)

Add a new function that shows active machines as a percentage over time — more useful than raw count:

```typescript
export async function machineActivePercentHistory(range = '-1h'): Promise<TimePoint[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "machine_summary" and (r._field == "active_machines" or r._field == "total_machines"))
  |> group(columns: ["node", "_field"])
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> group(columns: ["_time", "_field"])
  |> sum()
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> map(fn: (r) => ({
      _time: r._time,
      _value: if r.total_machines > 0 then float(v: r.active_machines) / float(v: r.total_machines) * 100.0 else 0.0,
    }))
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

Export it (it's already exported by the `export async function` declaration).

## Fix 4 — Wire machineActivePercentHistory into machines.astro and api/machines.ts

### src/pages/api/machines.ts

Add import and parallel fetch:
```typescript
import { ..., machineActivePercentHistory } from '@/lib/queries';

// In Promise.all, add:
machineActivePercentHistory(range),

// In response, add activityPctHistory:
return Response.json({ summary, types, mekanism, mi, activityHistory, activityPctHistory, slotItems, fluids });
```

### src/pages/machines.astro

Add to SSR imports and Promise.allSettled:
```typescript
import { ..., machineActivePercentHistory } from '@/lib/queries';

// Promise.allSettled:
machineActivePercentHistory('-1h'),

// Destructure:
const machActivityPct = machActivityPctRes.status === 'fulfilled' ? machActivityPctRes.value : [];
```

Change the ACTIVITY HISTORY panel to show BOTH raw active count AND active % as a dual panel:

```astro
<!-- Activity history charts -->
<div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
  <Panel title="ACTIVE MACHINES" raised>
    <div class="flex items-center gap-2 mb-3">
      <span class="font-mc text-[9px] text-mc-muted">RANGE:</span>
      <button data-chart-range="-1h"  class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-emerald">1H</button>
      <button data-chart-range="-6h"  class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">6H</button>
      <button data-chart-range="-24h" class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">24H</button>
      <button data-chart-range="-72h" class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">3D</button>
      <button data-chart-range="-7d"  class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">7D</button>
      <button data-chart-range="-14d" class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">14D</button>
      <button data-chart-range="-21d" class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">21D</button>
      <button data-chart-range="-31d" class="chart-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">31D</button>
    </div>
    <LineChart
      data={machActivity}
      colour="var(--color-mc-emerald)"
      height={80}
      id="chart-machine-activity"
    />
  </Panel>
  <Panel title="ACTIVE %" raised>
    <div class="flex items-center gap-2 mb-3">
      <span class="font-mc text-[9px] text-mc-muted">RANGE:</span>
      <button data-pct-range="-1h"  class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-gold">1H</button>
      <button data-pct-range="-6h"  class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">6H</button>
      <button data-pct-range="-24h" class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">24H</button>
      <button data-pct-range="-72h" class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">3D</button>
      <button data-pct-range="-7d"  class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">7D</button>
      <button data-pct-range="-14d" class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">14D</button>
      <button data-pct-range="-21d" class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">21D</button>
      <button data-pct-range="-31d" class="pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">31D</button>
    </div>
    <LineChart
      data={machActivityPct}
      colour="var(--color-mc-gold)"
      height={80}
      suffix="%"
      id="chart-machine-active-pct"
    />
  </Panel>
</div>
```

IMPORTANT: The original single ACTIVITY HISTORY panel (with grid `class="mb-6"`) should be REPLACED by this 2-panel grid. Remove the old single panel.

### Client script updates for the new pct range buttons

In the machines.astro client `<script>`, add handler for `.pct-range-btn` similar to the existing `.chart-range-btn` handler:

```typescript
document.querySelectorAll('.pct-range-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const range = btn.getAttribute('data-pct-range') ?? '-1h';
    document.querySelectorAll('.pct-range-btn').forEach(b => {
      b.className = 'pct-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] ' +
        (b === btn ? 'text-mc-gold' : 'text-mc-muted');
    });
    const data = await fetch(`/api/machines?range=${range}`).then(r => r.json()).catch(() => null);
    if (data?.activityPctHistory) {
      renderLineChart('chart-machine-active-pct', data.activityPctHistory, 'var(--color-mc-gold)');
    }
  });
});
```

Also update the existing `refresh()` function to redraw the pct chart too:
```typescript
if (data.activityPctHistory) {
  renderLineChart('chart-machine-active-pct', data.activityPctHistory, 'var(--color-mc-gold)');
}
```

## Verification
```bash
bun run build
```
Must complete "Complete!" with zero errors.

## Output
Report in chat:
- What the old craftingCpuHistory query was using vs what the fix does
- Files modified
- Build result
