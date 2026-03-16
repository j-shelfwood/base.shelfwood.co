# Task: Machines Page — Per-Mod Throughput History Charts

## Objective

Add historical throughput visualisations to the machines page:
1. MI machine active count history over time (Modern Industrialization machines active/total per window)
2. Mekanism machine active count history over time
These are separate from the global `machineActivityHistory` — they show per-mod trends.

## Context

`machineTypeHistory(type, range)` already exists in `src/lib/queries.ts` (line 820). It queries `mekanism_machine.active` per type. However, there is no equivalent for MI machines.

The `machine_type` measurement (queried in `machineTypes()` at line 348) has tags: `type`, `mod`, `category`, `node`. Fields: `active_count`, `total_count`. This data exists historically.

## Step 1 — Add modActivityHistory to queries.ts

Add a new function after `machineTypeHistory` (after line 831):

```typescript
export async function modActivityHistory(mod: string, range = '-1h'): Promise<TimePoint[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "machine_type" and r._field == "active_count" and r.mod == "${mod}")
  |> group(columns: ["node", "type", "_field"])
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

## Step 2 — Update src/pages/api/machines.ts

Add `modActivityHistory` to import and fetch both mod histories in parallel:

```typescript
import { ..., modActivityHistory } from '@/lib/queries';

// In Promise.all:
modActivityHistory('mekanism', range),
modActivityHistory('modern_industrialization', range),

// Add to response:
return Response.json({ summary, types, mekanism, mi, activityHistory, slotItems, fluids, mekHistory, miHistory });
```

The destructured variables from Promise.all will be `mekHistory` and `miHistory` (adjust index position accordingly).

## Step 3 — Update src/pages/machines.astro

### SSR fetch

```typescript
import { ..., modActivityHistory } from '@/lib/queries';

// Add to Promise.allSettled:
modActivityHistory('mekanism', '-1h'),
modActivityHistory('modern_industrialization', '-1h'),

// Destructure:
const mekHistory = mekHistRes.status === 'fulfilled' ? mekHistRes.value : [];
const miHistory  = miHistRes.status  === 'fulfilled' ? miHistRes.value  : [];
```

### Add a new panel after TYPE OVERVIEW

Place BEFORE the MEKANISM MACHINES section. Add a "MOD ACTIVITY HISTORY" panel showing both mods side by side:

```astro
<Panel title="MOD ACTIVITY HISTORY" raised class="mb-6">
  <div class="flex items-center gap-2 mb-3">
    <span class="font-mc text-[9px] text-mc-muted">RANGE:</span>
    <button data-mod-range="-1h"  class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-emerald">1H</button>
    <button data-mod-range="-6h"  class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">6H</button>
    <button data-mod-range="-24h" class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">24H</button>
    <button data-mod-range="-72h" class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">3D</button>
    <button data-mod-range="-7d"  class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">7D</button>
    <button data-mod-range="-14d" class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">14D</button>
    <button data-mod-range="-31d" class="mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">31D</button>
  </div>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div>
      <span class="font-mc text-xs text-mc-amethyst block mb-2">MEKANISM</span>
      <LineChart data={mekHistory} colour="var(--color-mc-amethyst)" height={80} id="chart-mek-history" />
    </div>
    <div>
      <span class="font-mc text-xs text-mc-diamond block mb-2">MODERN INDUSTRIALIZATION</span>
      <LineChart data={miHistory} colour="var(--color-mc-diamond)" height={80} id="chart-mi-history" />
    </div>
  </div>
</Panel>
```

### Client script — wire mod-range-btn

In the `<script>` block, add:

```typescript
document.querySelectorAll('.mod-range-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const range = btn.getAttribute('data-mod-range') ?? '-1h';
    document.querySelectorAll('.mod-range-btn').forEach(b => {
      b.className = 'mod-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] ' +
        (b === btn ? 'text-mc-emerald' : 'text-mc-muted');
    });
    const data = await fetch(`/api/machines?range=${range}`).then(r => r.json()).catch(() => null);
    if (data?.mekHistory) renderLineChart('chart-mek-history', data.mekHistory, 'var(--color-mc-amethyst)');
    if (data?.miHistory)  renderLineChart('chart-mi-history',  data.miHistory,  'var(--color-mc-diamond)');
  });
});
```

Also update `refresh()` to redraw on live poll:
```typescript
if (data.mekHistory) renderLineChart('chart-mek-history', data.mekHistory, 'var(--color-mc-amethyst)');
if (data.miHistory)  renderLineChart('chart-mi-history',  data.miHistory,  'var(--color-mc-diamond)');
```

## Verification
```bash
bun run build
```
Must complete "Complete!" with zero errors.

## Output
Report in chat:
- Files modified
- Build result
- Note if machine_type measurement had both mods in data
