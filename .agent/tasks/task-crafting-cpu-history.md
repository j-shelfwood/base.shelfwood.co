# Task: Crafting Page — CPU Utilization History + Active Jobs Board

## Objective
Two additions to crafting.astro:
1. CPU utilization % trend chart using ae_crafting_cpu measurement (busy_percent field, time-series)
2. Active jobs board showing per-CPU what's being crafted right now with quantity

## Real data context
ae_crafting_cpu measurement fields: busy (int), busy_percent (float), total (int)
  - 22 total CPUs, 4 busy (18.18%), measured at cc-58/me_bridge_2
ae_crafting_job measurement fields: completion (0-1), crafted (count), quantity (int)
  - tags: cpu (name), cpu_index (int), item (string)
  - Current jobs: ae2:charged_certus_quartz_crystal (96x), modern_industrialization:stainless_steel_drill (1x),
    ae2:certus_quartz_dust (3x), modern_industrialization:op_amp (1x), modern_industrialization:bronze_drill (1x),
    modern_industrialization:stainless_steel_ingot (128x), modern_industrialization:coke_dust (4x)

## Step 1 — Add CPU history query to queries.ts

After `craftingTaskHistory` (around line 617), add:
```typescript
export async function craftingCpuHistory(range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_crafting_cpu" and r._field == "busy_percent")
  |> group(columns: ["node", "source", "_field"])
  |> aggregateWindow(every: ${rangeToWindow(range)}, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> mean()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

IMPORTANT: `rangeToWindow` already exists near the top of queries.ts. Do NOT add it again.

## Step 2 — Update src/pages/api/crafting.ts

Add `craftingCpuHistory` to the parallel fetch:
```typescript
import { craftingJobs, aeCPUs, craftingTaskCount, craftingTaskHistory, craftingCpuHistory } from '@/lib/queries';

const [jobs, cpus, taskCount, taskHistory, cpuHistory] = await Promise.all([
  craftingJobs(),
  aeCPUs(),
  craftingTaskCount(),
  craftingTaskHistory(range),
  craftingCpuHistory(range),
]);

return Response.json({ jobs, cpus, taskCount, taskHistory, cpuHistory });
```

## Step 3 — Update src/pages/crafting.astro

### 3a — SSR data fetch
Add `craftingCpuHistory` to imports and SSR fetch:
```typescript
import { craftingJobs, aeCPUs, craftingTaskCount, craftingTaskHistory, craftingCpuHistory } from '@/lib/queries';

// In Promise.allSettled:
craftingCpuHistory('-1h'),

// Destructure:
const cpuHistory = cpuHistRes.status === 'fulfilled' ? cpuHistRes.value : [];
```

### 3b — Add CPU UTILIZATION chart panel

After the existing TASK QUEUE HISTORY panel, add a new panel:
```astro
<Panel title="CPU UTILIZATION %" raised class="mb-6">
  <div class="flex items-center gap-2 mb-3">
    <span class="font-mc text-[9px] text-mc-muted">RANGE:</span>
    <button data-cpu-range="-1h"  class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-amethyst">1H</button>
    <button data-cpu-range="-6h"  class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">6H</button>
    <button data-cpu-range="-24h" class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">24H</button>
    <button data-cpu-range="-7d"  class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">7D</button>
    <button data-cpu-range="-14d" class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">14D</button>
    <button data-cpu-range="-21d" class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">21D</button>
    <button data-cpu-range="-31d" class="cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">31D</button>
  </div>
  <LineChart
    data={cpuHistory}
    colour="var(--color-mc-amethyst)"
    height={80}
    suffix="%"
    id="chart-cpu-util"
  />
</Panel>
```

### 3c — Add ACTIVE JOBS board

The existing crafting.astro already shows CPU cells with job info. Add a dedicated ACTIVE JOBS section showing a clean table/list of what's currently being crafted:

```astro
<Panel title="ACTIVE JOBS" raised class="mb-6">
  <div id="active-jobs-list" class="space-y-2">
    {jobs.length === 0 && (
      <p class="font-mc text-base text-mc-muted py-2">No active crafting jobs</p>
    )}
    {jobs.map(j => {
      const itemLabel = j.item.replace(/^.*:/, '').replace(/_/g, ' ').toUpperCase();
      return (
        <div class="flex items-center justify-between pixel-border px-3 py-2 bg-mc-stone/20">
          <div class="flex flex-col">
            <span class="font-mc text-sm text-mc-white">{itemLabel}</span>
            <span class="font-mc text-xs text-mc-muted">{j.cpu} · CPU {j.cpu_index}</span>
          </div>
          <div class="text-right">
            <span class="font-mc text-base text-mc-amethyst">{j.quantity}x</span>
          </div>
        </div>
      );
    })}
  </div>
</Panel>
```

### 3d — Client script for CPU range switching + active jobs refresh

In the `<script>` block, find the existing `renderLineChart` function (already there).

Add CPU range handler:
```typescript
// ── CPU utilization range ─────────────────────────────────────────────────
document.querySelectorAll('.cpu-range-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const range = btn.getAttribute('data-cpu-range') ?? '-1h';
    document.querySelectorAll('.cpu-range-btn').forEach(b => {
      b.className = 'cpu-range-btn mc-slot px-2 py-0.5 font-mc text-[9px] ' +
        (b.getAttribute('data-cpu-range') === range ? 'text-mc-amethyst' : 'text-mc-muted');
    });
    const data = await fetch(`/api/crafting?range=${range}`).then(r => r.json()).catch(() => null);
    if (data?.cpuHistory) renderLineChart('chart-cpu-util', data.cpuHistory, 'var(--color-mc-amethyst)');
  });
});
```

Also update the existing `refreshCrafting()` function to refresh the active jobs list:
```typescript
// Inside refreshCrafting, after renderCrafting(data.cpus, data.jobs):
const jobsList = document.getElementById('active-jobs-list');
if (jobsList && data.jobs) {
  if (data.jobs.length === 0) {
    jobsList.innerHTML = '<p class="font-mc text-base text-mc-muted py-2">No active crafting jobs</p>';
  } else {
    jobsList.innerHTML = data.jobs.map((j: {item:string;cpu:string;cpu_index:number;quantity:number}) => {
      const label = j.item.replace(/^.*:/, '').replace(/_/g, ' ').toUpperCase();
      return `<div class="flex items-center justify-between pixel-border px-3 py-2 bg-mc-stone/20">
        <div class="flex flex-col">
          <span class="font-mc text-sm text-mc-white">${label}</span>
          <span class="font-mc text-xs text-mc-muted">${j.cpu} · CPU ${j.cpu_index}</span>
        </div>
        <span class="font-mc text-base text-mc-amethyst">${j.quantity}x</span>
      </div>`;
    }).join('');
  }
}

// Also update CPU util chart on refresh:
if (data.cpuHistory) renderLineChart('chart-cpu-util', data.cpuHistory, 'var(--color-mc-amethyst)');
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
