# Task: Machines + Crafting Pages — History Charts & Enrichment

## Objective
Add historical context to the Machines and Crafting pages:
1. **Machines page**: active machine count history chart, per-type uptime stats, MI slot item detail
2. **Crafting page**: CPU utilisation history chart, task queue depth chart, task count stat

## Project Structure
```bash
tree --gitignore -L 3
```

## Discovery
```bash
cat src/pages/machines.astro
cat src/pages/crafting.astro
cat src/pages/api/machines.ts
cat src/pages/api/crafting.ts
cat src/components/charts/LineChart.astro
cat src/components/charts/DualLineChart.astro
cat src/components/mc/Panel.astro
cat src/components/mc/StatCard.astro
cat src/styles/theme.css
```

## Context

### APIs available (agent 1 is adding these):
- `/api/machines` — existing, agent 1 is adding `activityHistory` field (array of `{time, value}` — active machine count over time)
- `/api/crafting` — existing, agent 1 is adding `taskCount` (number) field
- `/api/history?range=<range>` — existing energy history, may accept range param after agent 1

### New endpoints you can call from client-side:
- `/api/machines?activityHistory=1&range=<range>` — not guaranteed; fall back to polling /api/machines and extracting activityHistory from the payload
- Better approach: the `/api/machines` response will include `activityHistory` in its normal payload

### MI slot data available at `/api/machines`:
The machines API response includes `mi` array. Each MI machine already has `occupied_slots` and `total_slots`.
Agent 1 is NOT adding per-slot item detail to the API — so for MI slot items, you need a new approach.

Actually, for MI slot items: The `mi_machine_slot` measurement has `item` and `count` per slot per machine.
Add a new query function call and API endpoint yourself if needed, OR enrich the existing `/api/machines` response.

### Existing machine cell structure (machines.astro):
- Each machine rendered as `w-14 h-14` pixel-border cell
- Tooltip on hover shows name, active status, energy, slots
- Cells grouped by type with active count header

### LineChart.astro usage:
```astro
<LineChart
  data={JSON.stringify(historyPoints)}
  label="Active Machines"
  colour="emerald"
  id="chart-machine-activity"
/>
```
LineChart takes `data` as JSON string of `{time: string, value: number}[]`, `label`, `colour`, optional `id`.

## Implementation

### MACHINES PAGE

#### 1. Add machine activity history chart

In `src/pages/machines.astro` frontmatter, add:
```typescript
import { machineActivityHistory } from '@/lib/queries';
// Add to Promise.allSettled:
const machActivityRes = await machineActivityHistory('-1h');
const machActivity = machActivityRes ?? [];
```

After the summary stats grid, before the Mekanism panel, add:
```astro
<Panel title="ACTIVITY · 1H" raised class="mb-6">
  <LineChart
    data={JSON.stringify(machActivity)}
    label="Active Machines"
    colour="emerald"
    id="chart-machine-activity"
  />
</Panel>
```

Add client-side refresh of the chart every 60s by fetching `/api/machines` which includes `activityHistory`.
Use the same `renderSparkline` pattern for client-side chart updates (SVG inline):

```typescript
function renderLineChart(containerId: string, points: {time: string; value: number}[], colour: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (points.length < 2) return;
  const W = container.clientWidth || 600;
  const H = 80;
  const pad = 4;
  const min = Math.min(...points.map(p => p.value));
  const max = Math.max(...points.map(p => p.value));
  const range = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
  const ys = points.map(p => H - pad - ((p.value - min) / range) * (H - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  const fillD = `${d} L${xs[xs.length-1]!.toFixed(1)},${H} L${xs[0]!.toFixed(1)},${H} Z`;
  const colourVar = `var(--color-mc-${colour})`;
  // Find the SVG element inside or replace innerHTML
  const existing = container.querySelector('svg');
  const svgHtml = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${fillD}" fill="${colourVar}" opacity="0.15"/>
    <path d="${d}" fill="none" stroke="${colourVar}" stroke-width="1.5" opacity="0.9"/>
  </svg>`;
  if (existing) existing.outerHTML = svgHtml;
  else container.innerHTML = svgHtml;
}
```

#### 2. Add uptime % to machine type summary

In the existing machine types grid (if present on machines page), or add a new "UPTIME SUMMARY" panel.

Look at how `machineTypes()` data is used. If there's a types breakdown, add `active_percent` as a bar per type row.

If no types panel exists on machines.astro, add one before the Mekanism grid:
```astro
<Panel title="TYPE SUMMARY" raised noPadding class="mb-6">
  <div class="divide-y divide-mc-cobble/50">
    {types.filter(t => t.total_count > 0).map(t => (
      <div class="px-4 py-2 flex items-center gap-3">
        <span class="font-mc text-xs text-mc-white w-40 truncate capitalize">{t.type.replace(/_/g, ' ')}</span>
        <div class="flex-1 h-1.5 bg-mc-shadow">
          <div class="h-full bg-mc-emerald transition-all" style={`width:${t.active_percent.toFixed(0)}%`} />
        </div>
        <span class="font-mc text-xs text-mc-emerald w-12 text-right">{t.active_count}/{t.total_count}</span>
        <span class="font-mc text-xs text-mc-muted w-12 text-right">{t.active_percent.toFixed(0)}%</span>
      </div>
    ))}
  </div>
</Panel>
```

Import `machineTypes` if not already imported in machines.astro.

#### 3. Enrich MI machine tooltips with slot item detail

In `src/pages/api/machines.ts`, add a new parallel fetch for `mi_machine_slot` data.

Add this query to `src/lib/queries.ts`:
```typescript
export interface MISlotItem {
  name: string;    // machine name
  item: string;    // item being processed
  count: number;   // slots with this item
}

export async function miMachineSlotItems(): Promise<MISlotItem[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "mi_machine_slot" and r._field == "count")
  |> group(columns: ["name", "item", "node"])
  |> last()
  |> group()
  |> sort(columns: ["_value"], desc: true)
`);
  return rows.map(r => ({
    name: String(r.name ?? ''),
    item: String(r.item ?? ''),
    count: (r._value as number) ?? 0,
  }));
}
```

In `/api/machines.ts`, add `miMachineSlotItems()` to the parallel fetch and include `slotItems` in the response.

In `machines.astro` and the client-side `buildMICellInner` function, use slotItems to show what each machine is processing in the tooltip. Group slotItems by machine name into a Map, then for each MI cell tooltip, show the top 3 items being processed:

```typescript
// In tooltip HTML for MI machines:
const machineSlots = slotItemMap.get(m.name) ?? [];
const slotDetail = machineSlots.slice(0, 3).map(s =>
  `<div class="flex items-center justify-between gap-2">
     <span class="font-mc text-[8px] text-mc-white capitalize">${s.item.replace(/^.*:/, '').replace(/_/g, ' ')}</span>
     <span class="font-mc text-[8px] text-mc-diamond">×${s.count}</span>
   </div>`
).join('');
```

Add this to the MI cell tooltip after the slots row.

### CRAFTING PAGE

#### 1. Add task queue depth stat card

In `crafting.astro`, import `craftingTaskCount` (agent 1 adds this to queries.ts).
Add to the parallel fetch. Change stats row from 3 to 4 columns:
- CPUs Busy, Active Jobs, CPUs Free, **Task Queue** (task count, colour=gold)

Update the 3-column grid to `grid-cols-4`.

In the client-side refresh, update `stat-tasks` from the `taskCount` in the API response.

#### 2. Add CPU utilisation history chart

In `crafting.astro` frontmatter, import and call `craftingTaskHistory('-1h')`.

After the stats row, add:
```astro
<Panel title="QUEUE DEPTH · 1H" raised class="mb-6">
  <LineChart
    data={JSON.stringify(taskHistory)}
    label="Pending Sub-tasks"
    colour="gold"
    id="chart-task-queue"
  />
</Panel>
```

Add client-side refresh: in the existing `refresh()` function, after updating CPU stats, also update the chart using the `renderLineChart` function (same SVG approach as machines page).

The crafting API will include `taskCount` and optionally history. For history, either:
a) Add a `?history=1` param to `/api/crafting` and fetch it separately every 60s
b) Or include `taskHistory` array directly in the normal `/api/crafting` response (preferred — keeps refresh simple)

Prefer option b. Update `/api/crafting.ts` to include `craftingTaskHistory('-1h')` in the parallel fetch and include in response.

#### 3. Add a "Jobs completed" indicator

In crafting.astro, below the CPU grid panel, add a small panel showing the task queue history chart (already done above) and a note about what the count means:

```astro
<p class="font-mc text-[9px] text-mc-muted mt-1">
  Sub-tasks queued across all active crafting jobs
</p>
```

## Quality Requirements
- Match existing pixel-border / font-mc aesthetic exactly
- Charts should be 80px tall (h-20) to stay compact
- Client-side chart updates should not flicker — replace SVG in-place
- All new stat cards need `id` attributes for client-side updates
- TypeScript must be clean — no `any` unless unavoidable

## Output
After all changes, run:
```bash
cd /Users/shelfwood/Projects/base.shelfwood.co && npx tsc --noEmit 2>&1 | head -40
```
Output the TypeScript check result and a summary of all files modified. Do NOT commit.
