# Task: Add AE Network Historical Charts

## Objective
Add `aeSummaryHistory` query + update the ae-summary API to serve time-series data, then add 3 history charts to the AE section of index.astro with a shared range selector.

## Project Structure
```bash
tree --gitignore -L 2
```

## Step 1 — Add queries to src/lib/queries.ts

After the `aeSummary()` function (around line 194), add this new function:

```typescript
export async function aeSummaryHistory(field: 'items_total' | 'energy_usage' | 'item_storage_used', range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_summary" and r._field == "${field}")
  |> group(columns: ["node", "_field"])
  |> aggregateWindow(every: ${rangeToWindow(range)}, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
```

IMPORTANT: `rangeToWindow` is already defined near the top of queries.ts — do NOT add it again. Just call it.

## Step 2 — Update src/pages/api/ae-summary.ts

Replace the entire file content with:

```typescript
import type { APIRoute } from 'astro';
import { aeSummary, aeCPUs, aeSummaryHistory } from '@/lib/queries';

const VALID_RANGE = /^-\d+[smhd]$/;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range');
    const range = rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h';

    const [summary, cpus, itemsHistory, energyHistory, storageHistory] = await Promise.all([
      aeSummary(),
      aeCPUs(),
      aeSummaryHistory('items_total', range),
      aeSummaryHistory('energy_usage', range),
      aeSummaryHistory('item_storage_used', range),
    ]);

    return Response.json({ summary, cpus, itemsHistory, energyHistory, storageHistory });
  } catch (err) {
    console.error('ae-summary API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
```

## Step 3 — Update src/pages/index.astro

### 3a — Update SSR imports and data fetching

The frontmatter already imports from queries. Add `aeSummaryHistory` to the import:
```typescript
import {
  energySummary, energyFlow, energyHistory, energyStoredHistory, energyFlowHistory, energyDevices,
  aeSummary, aeCPUs, aeItems, aeItemVelocity, aeSummaryHistory,
  machineSummary, machineTypes, mekanismMachines, miMachines as fetchMiMachines,
  craftingJobs,
} from '@/lib/queries';
```

Add 3 more entries to the Promise.allSettled array (after the existing energyDevices() call):
```typescript
const [
  energyRes, flowRes, eHistRes, eStoredHistRes, fHistRes, devicesRes,
  aeRes, cpusRes, itemsRes, velocityRes,
  aeItemsHistRes, aeEnergyHistRes, aeStorageHistRes,
  machSumRes, machTypesRes, mekRes, miRes,
  jobsRes,
] = await Promise.allSettled([
  energySummary(), energyFlow(), energyHistory('-1h'), energyStoredHistory('-1h'), energyFlowHistory('-1h'), energyDevices(),
  aeSummary(), aeCPUs(), aeItems(), aeItemVelocity('-30m', 15),
  aeSummaryHistory('items_total', '-1h'), aeSummaryHistory('energy_usage', '-1h'), aeSummaryHistory('item_storage_used', '-1h'),
  machineSummary(), machineTypes(), mekanismMachines(), fetchMiMachines(),
  craftingJobs(),
]);
```

Then add the resolved values after the existing `const velocity = ...` line:
```typescript
const aeItemsHist    = aeItemsHistRes.status   === 'fulfilled' ? aeItemsHistRes.value   : [];
const aeEnergyHist   = aeEnergyHistRes.status  === 'fulfilled' ? aeEnergyHistRes.value  : [];
const aeStorageHist  = aeStorageHistRes.status === 'fulfilled' ? aeStorageHistRes.value : [];
```

### 3b — Add AE history chart section in the HTML template

Find the AE section in index.astro. It has a heading "APPLIED ENERGISTICS" or similar and stat cards for items. After the AE stat cards grid, add this block:

```astro
<!-- AE history charts -->
<div class="flex items-center gap-2 mb-3">
  <span class="font-mc text-base text-mc-muted">RANGE:</span>
  {[['1H','-1h'],['6H','-6h'],['24H','-24h'],['7D','-7d']].map(([label, val]) => (
    <button data-ae-range={val}
      class:list={['ae-range-btn font-mc text-sm px-3 py-1 pixel-border transition-colors',
        val === '-1h' ? 'bg-mc-diamond/20 text-mc-diamond border-mc-diamond' : 'bg-mc-stone/40 text-mc-muted hover:text-mc-white']}
    >{label}</button>
  ))}
  <span id="ae-range-loading" class="font-mc text-sm text-mc-muted hidden">LOADING...</span>
</div>
<div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
  <Panel title="TOTAL ITEMS STORED" raised>
    <LineChart data={aeItemsHist} colour="var(--color-mc-diamond)" height={90} suffix="" id="chart-ae-items" />
  </Panel>
  <Panel title="AE ENERGY USAGE" raised>
    <LineChart data={aeEnergyHist} colour="var(--color-mc-amethyst)" height={90} suffix=" FE/t" id="chart-ae-energy" />
  </Panel>
  <Panel title="STORAGE FILL" raised>
    <LineChart data={aeStorageHist} colour="var(--color-mc-lapis)" height={90} suffix=" slots" id="chart-ae-storage" />
  </Panel>
</div>
```

### 3c — Add AE range selector client script

In the `<script>` block, before the `// ── Kick off all loops` comment, add:

```typescript
// ── AE range selector ─────────────────────────────────────────────────────
let aeRange = '-1h';
async function switchAERange(range: string) {
  aeRange = range;
  const loading = document.getElementById('ae-range-loading');
  if (loading) loading.classList.remove('hidden');
  document.querySelectorAll<HTMLButtonElement>('.ae-range-btn').forEach(btn => {
    const active = btn.dataset.aeRange === range;
    btn.className = `ae-range-btn font-mc text-sm px-3 py-1 pixel-border transition-colors ${active ? 'bg-mc-diamond/20 text-mc-diamond border-mc-diamond' : 'bg-mc-stone/40 text-mc-muted hover:text-mc-white'}`;
  });
  const data = await fetch(`/api/ae-summary?range=${range}`).then(r => r.json()).catch(() => null);
  if (loading) loading.classList.add('hidden');
  if (!data) return;
  if (data.itemsHistory) renderSvgLine('chart-ae-items', data.itemsHistory, 'var(--color-mc-diamond)');
  if (data.energyHistory) renderSvgLine('chart-ae-energy', data.energyHistory, 'var(--color-mc-amethyst)', ' FE/t');
  if (data.storageHistory) renderSvgLine('chart-ae-storage', data.storageHistory, 'var(--color-mc-lapis)', ' slots');
}

document.querySelectorAll<HTMLButtonElement>('.ae-range-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const r = btn.dataset.aeRange;
    if (r) switchAERange(r);
  });
});
```

NOTE: `renderSvgLine` is already defined in the script block (added in a previous session for the energy range selector). Do NOT redefine it.

## Verification
```bash
bun run build
```
Must complete with no errors. Output: "Complete!"

## Output
Report in chat:
- Files modified
- Whether build succeeded
