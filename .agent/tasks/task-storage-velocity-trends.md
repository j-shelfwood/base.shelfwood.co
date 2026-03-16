# Task: Storage Page — Item Velocity Leaderboard + Fluid/Chemical Totals History

## Objective
Two additions to storage.astro:
1. Item velocity leaderboard (top gainers + top losers) — `aeItemVelocity` data currently only shown on index.astro, belongs on storage page
2. Fluid and chemical total stored history charts using `aeSummaryHistory('fluids_total')` and `aeSummaryHistory('chemicals_total')`

## Real data context

### ae_item velocity (6h window, difference):
Top gainers: ae2:certus_quartz_crystal (+3744), xycraft_world:xychorium_gem_red (+3140),
  xychorium_gem_green (+3020), xychorium_gem_dark (+3000), minecraft:redstone (+2656)
Top losers: (negative delta items being consumed)

### ae_summary measurement has these fields over time:
- items_total, items_unique
- fluids_total, fluids_unique  ← NEW — not currently charted anywhere
- chemicals_total, chemicals_unique  ← NEW — not currently charted anywhere
- item_storage_used, item_storage_total
- fluid_storage_used, fluid_storage_total
- chemical_storage_used, chemical_storage_total
- energy_usage

## Step 1 — Verify aeSummaryHistory supports fluids_total and chemicals_total

Open src/lib/queries.ts. Find `aeSummaryHistory` (around line 196).
Current signature:
```typescript
export async function aeSummaryHistory(field: 'items_total' | 'energy_usage' | 'item_storage_used', range = '-1h')
```

Update the union type to include the new fields:
```typescript
export async function aeSummaryHistory(
  field: 'items_total' | 'energy_usage' | 'item_storage_used' | 'fluids_total' | 'chemicals_total' | 'fluid_storage_used' | 'chemical_storage_used',
  range = '-1h'
): Promise<TimePoint[]>
```
The function body does NOT need to change — it uses the field as a string in the Flux query template.

## Step 2 — Update src/pages/api/ae-summary.ts

Add fluidsHistory and chemicalsHistory to the parallel fetch:
```typescript
const [summary, cpus, itemsHistory, energyHistory, storageHistory, fluidsHistory, chemicalsHistory] = await Promise.all([
  aeSummary(),
  aeCPUs(),
  aeSummaryHistory('items_total', range),
  aeSummaryHistory('energy_usage', range),
  aeSummaryHistory('item_storage_used', range),
  aeSummaryHistory('fluids_total', range),
  aeSummaryHistory('chemicals_total', range),
]);

return Response.json({ summary, cpus, itemsHistory, energyHistory, storageHistory, fluidsHistory, chemicalsHistory });
```

## Step 3 — Update src/pages/storage.astro

### 3a — SSR data fetch for new histories + velocity

Check what's already imported. Currently imports `aeSummaryHistory` and fetches 3 histories.

Add to imports:
```typescript
import { ..., aeItemVelocity, aeFluidVelocity, aeChemicalVelocity } from '@/lib/queries';
```
(velocity functions may already be imported — check first)

Add to Promise.allSettled:
```typescript
aeSummaryHistory('fluids_total', '-1h'),
aeSummaryHistory('chemicals_total', '-1h'),
aeItemVelocity('-6h', 10),   // top 10 gainers/losers over 6h
```

Add destructure:
```typescript
const aeFluidsHist     = fluidsHistRes.status     === 'fulfilled' ? fluidsHistRes.value     : [];
const aeChemicalsHist  = chemicalsHistRes.status  === 'fulfilled' ? chemicalsHistRes.value  : [];
const itemVelocity     = velRes.status             === 'fulfilled' ? velRes.value            : [];
```

### 3b — Expand the overview charts from 3 to 5 panels

Currently: `grid-cols-1 lg:grid-cols-3` with Items | Energy | Storage Fill

Change to `grid-cols-1 lg:grid-cols-5` and add 2 more:
```astro
<div class="grid grid-cols-1 lg:grid-cols-5 gap-3 mb-6">
  <Panel title="TOTAL ITEMS" raised>
    <LineChart data={aeItemsHist} ... id="chart-storage-items" />
  </Panel>
  <Panel title="TOTAL FLUIDS (mB)" raised>
    <LineChart data={aeFluidsHist} colour="var(--color-mc-diamond)" height={80} suffix=" mB" id="chart-storage-fluids" />
  </Panel>
  <Panel title="TOTAL CHEMICALS" raised>
    <LineChart data={aeChemicalsHist} colour="var(--color-mc-emerald)" height={80} suffix="" id="chart-storage-chemicals" />
  </Panel>
  <Panel title="AE ENERGY" raised>
    <LineChart data={aeEnergyHist} ... id="chart-storage-energy" />
  </Panel>
  <Panel title="ITEM FILL" raised>
    <LineChart data={aeStorageHist} ... id="chart-storage-fill" />
  </Panel>
</div>
```

### 3c — Add ITEM VELOCITY leaderboard panel

After the overview charts, before the tab navigation, add:

```astro
<Panel title="ITEM VELOCITY (6H)" raised class="mb-4">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    {/* Top gainers */}
    <div>
      <span class="font-mc text-xs text-mc-emerald block mb-2">TOP GAINERS</span>
      <div class="space-y-1" id="velocity-gainers">
        {itemVelocity.filter(v => v.delta > 0).slice(0, 8).map(v => {
          const label = v.item.replace(/^.*:/, '').replace(/_/g, ' ');
          const maxDelta = Math.max(...itemVelocity.filter(x => x.delta > 0).map(x => x.delta), 1);
          const pct = Math.min(100, (v.delta / maxDelta) * 100);
          return (
            <div class="flex items-center gap-2">
              <span class="font-mc text-xs text-mc-muted truncate w-32 shrink-0">{label}</span>
              <div class="flex-1 mc-progress-track">
                <div class="mc-progress-fill bg-mc-emerald" style={`width:${pct}%`} />
              </div>
              <span class="font-mc text-xs text-mc-emerald w-14 text-right shrink-0">+{v.delta >= 1000 ? (v.delta/1000).toFixed(1)+'K' : v.delta}</span>
            </div>
          );
        })}
      </div>
    </div>
    {/* Top losers */}
    <div>
      <span class="font-mc text-xs text-mc-redstone block mb-2">TOP CONSUMERS</span>
      <div class="space-y-1" id="velocity-losers">
        {itemVelocity.filter(v => v.delta < 0).slice(0, 8).map(v => {
          const label = v.item.replace(/^.*:/, '').replace(/_/g, ' ');
          const maxDelta = Math.max(...itemVelocity.filter(x => x.delta < 0).map(x => Math.abs(x.delta)), 1);
          const pct = Math.min(100, (Math.abs(v.delta) / maxDelta) * 100);
          return (
            <div class="flex items-center gap-2">
              <span class="font-mc text-xs text-mc-muted truncate w-32 shrink-0">{label}</span>
              <div class="flex-1 mc-progress-track">
                <div class="mc-progress-fill bg-mc-redstone" style={`width:${pct}%`} />
              </div>
              <span class="font-mc text-xs text-mc-redstone w-14 text-right shrink-0">{v.delta >= -1000 ? v.delta : (v.delta/1000).toFixed(1)+'K'}</span>
            </div>
          );
        })}
      </div>
    </div>
  </div>
</Panel>
```

### 3d — Update range selector client script

The existing `renderSvgLine` range handler for storage needs to also update the 2 new charts.

Find the click handler for `.storage-hist-btn` and add:
```typescript
if (data.fluidsHistory) renderSvgLine('chart-storage-fluids', data.fluidsHistory, 'var(--color-mc-diamond)', ' mB');
if (data.chemicalsHistory) renderSvgLine('chart-storage-chemicals', data.chemicalsHistory, 'var(--color-mc-emerald)', '');
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
- Note if velocity data showed gainers/losers or was flat
