# Task: Per-Machine-Type Activity Sparklines + Storage Overview Charts

## Objective
Two sub-tasks:
1. Add per-machine-type active% sparklines to machines.astro TYPE SUMMARY panel
2. Add AE item count + storage utilization trend charts to the top of storage.astro

## Project Structure
```bash
tree --gitignore -L 2
```

---

## Sub-task A: machines.astro — per-type sparklines

### Background
machines.astro already has an ACTIVITY HISTORY chart for total active machine count.
It also has a TYPE SUMMARY panel with active% progress bars per machine type.

The `/api/machines` endpoint already returns `types` — an array of `{ type, active_count, total_count, active_percent }`.
`machineActivityHistory` in queries.ts queries `machine_summary._field == "active_machines"` grouped by node.

### New query needed in src/lib/queries.ts

After `machineActivityHistory` (around line 787), add:

```typescript
export async function machineTypeHistory(type: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "mekanism_machine" and r._field == "active" and r.type == "${type}")
  |> group(columns: ["node", "type", "_field"])
  |> aggregateWindow(every: ${rangeToWindow(range)}, fn: sum, createEmpty: false)
  |> group(columns: ["_time", "type"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

IMPORTANT: `rangeToWindow` already exists near top of queries.ts. Do NOT add it again.

### Update src/pages/api/machines.ts

Add `machineTypeHistory` to imports and add a `?typeHistory=<type>` query param:

```typescript
import type { APIRoute } from 'astro';
import { machineSummary, machineTypes, mekanismMachines, miMachines, machineActivityHistory, miMachineSlotItems, machineTypeHistory } from '@/lib/queries';

const VALID_RANGE = /^-\d+[smhd]$/;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range');
    const range = rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h';
    const typeHistParam = url.searchParams.get('typeHistory');

    // If typeHistory param given, return just that series
    if (typeHistParam) {
      const history = await machineTypeHistory(typeHistParam, range);
      return Response.json({ history });
    }

    const [summary, types, mekanism, mi, activityHistory, slotItems] = await Promise.all([
      machineSummary(),
      machineTypes(),
      mekanismMachines(),
      miMachines(),
      machineActivityHistory(range),
      miMachineSlotItems(),
    ]);

    return Response.json({ summary, types, mekanism, mi, activityHistory, slotItems });
  } catch (err) {
    console.error('machines API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
```

### Update machines.astro TYPE SUMMARY panel

Find the TYPE SUMMARY panel. It currently shows per-type rows with active% progress bars.
Add a small inline sparkline div after each progress bar that fetches on click.

Find the TYPE SUMMARY panel HTML — it looks something like:
```html
<Panel title="TYPE SUMMARY" raised class="mb-6">
  <div class="grid grid-cols-2 gap-3">
    {Object.entries(mekByType).map(([type, machines]) => {
      ...
      return (
        <div class="flex flex-col gap-1" data-type-summary={type}>
          ...progress bar...
        </div>
      )
    })}
  </div>
</Panel>
```

Add a `data-type-summary` attribute and a sparkline placeholder div to each entry:

Each type row should have:
```astro
<div class="flex flex-col gap-1 cursor-pointer hover:opacity-80" data-type-summary={type}>
  <div class="flex justify-between">
    <span class="font-mc text-sm text-mc-{col} uppercase">{formatMachineType(type)}</span>
    <span class="font-mc text-sm text-mc-muted">{active}/{machines.length}</span>
  </div>
  <div class="mc-progress-track">
    <div class="mc-progress-fill bg-mc-{col}" style={`width:${(active/machines.length*100).toFixed(0)}%`} />
  </div>
  <div class="type-sparkline-container h-8 w-full opacity-60" data-type={type}></div>
</div>
```

### Add client-side sparkline loading in machines.astro <script> block

Add this function before the setInterval calls:

```typescript
// ── Per-type sparklines ───────────────────────────────────────────────────
function renderMiniSparkline(container: HTMLElement, points: {time:string;value:number}[]) {
  if (points.length < 2) return;
  const W = 200, H = 28, pad = 2;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
  const ys = points.map(p => H - pad - ((p.value - min) / range) * (H - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  container.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="var(--color-mc-emerald)" stroke-width="1" opacity="0.7"/>
  </svg>`;
}

async function loadTypeSparklines() {
  const containers = document.querySelectorAll<HTMLElement>('.type-sparkline-container');
  for (const c of containers) {
    const type = c.dataset.type;
    if (!type) continue;
    try {
      const data = await fetch(`/api/machines?typeHistory=${encodeURIComponent(type)}&range=-1h`).then(r => r.json());
      if (data.history?.length > 1) renderMiniSparkline(c, data.history);
    } catch {}
  }
}
```

Then call `loadTypeSparklines()` in the "Immediate first load" section at the bottom.

---

## Sub-task B: storage.astro — overview charts at top

### Background
storage.astro currently shows tabs (ITEMS / FLUIDS / CHEMICALS) and item/fluid/chemical lists.
Individual items have inline expandable sparklines on click.
There are NO overview trend charts at the top of the page.

### What to add
At the top of storage.astro (before the tab navigation), add:
- A range selector (1H / 6H / 24H / 7D)
- 3 charts: Total Items Stored trend, AE Energy Usage trend, Storage Fill% trend
- These should fetch from `/api/ae-summary?range=<r>`

### SSR changes in storage.astro frontmatter

Check what's already imported. If `aeSummaryHistory` is not imported yet, add it to the imports from `@/lib/queries`.

Add to the SSR Promise.allSettled (or parallel fetches):
```typescript
import { ..., aeSummaryHistory } from '@/lib/queries';

// In Promise.allSettled or parallel await:
const [itemsHistRes, energyHistRes, storageHistRes] = await Promise.allSettled([
  aeSummaryHistory('items_total', '-1h'),
  aeSummaryHistory('energy_usage', '-1h'),
  aeSummaryHistory('item_storage_used', '-1h'),
]);
const aeItemsHist   = itemsHistRes.status   === 'fulfilled' ? itemsHistRes.value   : [];
const aeEnergyHist  = energyHistRes.status  === 'fulfilled' ? energyHistRes.value  : [];
const aeStorageHist = storageHistRes.status === 'fulfilled' ? storageHistRes.value : [];
```

### HTML template changes

Before the tab navigation div in the template, insert:

```astro
import LineChart from '@/components/charts/LineChart.astro';

<!-- AE Overview Charts -->
<div class="flex items-center gap-2 mb-3">
  <span class="font-mc text-base text-mc-muted">RANGE:</span>
  {[['1H','-1h'],['6H','-6h'],['24H','-24h'],['7D','-7d']].map(([label, val]) => (
    <button data-storage-range={val}
      class:list={['storage-hist-btn font-mc text-sm px-3 py-1 pixel-border transition-colors',
        val === '-1h' ? 'bg-mc-diamond/20 text-mc-diamond border-mc-diamond' : 'bg-mc-stone/40 text-mc-muted hover:text-mc-white']}
    >{label}</button>
  ))}
  <span id="storage-hist-loading" class="font-mc text-sm text-mc-muted hidden">LOADING...</span>
</div>
<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
  <Panel title="TOTAL ITEMS STORED" raised>
    <LineChart data={aeItemsHist} colour="var(--color-mc-diamond)" height={80} suffix="" id="chart-storage-items" />
  </Panel>
  <Panel title="AE ENERGY USAGE" raised>
    <LineChart data={aeEnergyHist} colour="var(--color-mc-amethyst)" height={80} suffix=" FE/t" id="chart-storage-energy" />
  </Panel>
  <Panel title="STORAGE FILL" raised>
    <LineChart data={aeStorageHist} colour="var(--color-mc-lapis)" height={80} suffix=" slots" id="chart-storage-fill" />
  </Panel>
</div>
```

Make sure `Panel` and `LineChart` are imported at the top of storage.astro if not already.

### Client script for range switching

In the storage.astro `<script>` block, add a `renderSvgLine` function and range button handler.
FIRST check if `renderSvgLine` already exists in the script — if so, skip adding it.

If it doesn't exist, add:
```typescript
function renderSvgLine(containerId: string, points: {time:string;value:number}[], colour: string) {
  const el = document.getElementById(containerId);
  if (!el || points.length < 2) return;
  const W = 400, H = 80, pad = 6;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
  const ys = points.map(p => H - pad - ((p.value - min) / range) * (H - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  const fillD = `${d} L${xs[xs.length-1]!.toFixed(1)},${H} L${xs[0]!.toFixed(1)},${H} Z`;
  const svg = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${fillD}" fill="${colour}" opacity="0.15"/>
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="1.5" opacity="0.9"/>
  </svg>`;
  const existing = el.querySelector('svg');
  if (existing) existing.outerHTML = svg; else el.innerHTML = svg;
}
```

Then add the range handler:
```typescript
document.querySelectorAll<HTMLButtonElement>('.storage-hist-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const range = btn.dataset.storageRange;
    if (!range) return;
    document.querySelectorAll<HTMLButtonElement>('.storage-hist-btn').forEach(b => {
      const active = b.dataset.storageRange === range;
      b.className = `storage-hist-btn font-mc text-sm px-3 py-1 pixel-border transition-colors ${active ? 'bg-mc-diamond/20 text-mc-diamond border-mc-diamond' : 'bg-mc-stone/40 text-mc-muted hover:text-mc-white'}`;
    });
    const loading = document.getElementById('storage-hist-loading');
    if (loading) loading.classList.remove('hidden');
    const data = await fetch(`/api/ae-summary?range=${range}`).then(r => r.json()).catch(() => null);
    if (loading) loading.classList.add('hidden');
    if (!data) return;
    if (data.itemsHistory) renderSvgLine('chart-storage-items', data.itemsHistory, 'var(--color-mc-diamond)');
    if (data.energyHistory) renderSvgLine('chart-storage-energy', data.energyHistory, 'var(--color-mc-amethyst)');
    if (data.storageHistory) renderSvgLine('chart-storage-fill', data.storageHistory, 'var(--color-mc-lapis)');
  });
});
```

---

## Verification
```bash
bun run build
```
Must complete with "Complete!" and no errors.

## Output
Report in chat:
- All files modified
- Build result
