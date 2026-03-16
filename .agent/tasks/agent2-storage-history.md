# Task: Storage Page — Fluids, Chemicals, Item History

## Objective
Enrich the Storage page (`src/pages/storage.astro`) with:
1. Tabs for Items / Fluids / Chemicals
2. Fluid and Chemical browsers (same style as item list)
3. Per-item/fluid/chemical click-to-expand history chart
4. Top producers/consumers for fluids and chemicals
5. Inline sparklines for top items

## Project Structure
```bash
tree --gitignore -L 3
```

## Discovery
```bash
cat src/pages/storage.astro
cat src/components/charts/LineChart.astro
cat src/components/mc/StatCard.astro
cat src/components/mc/Panel.astro
cat src/components/mc/ProgressBar.astro
cat src/styles/theme.css
cat src/styles/site.css
```

## Context

### Data available via API (agent 1 is creating these endpoints):
- `/api/ae-items` — existing: items list, `?q=search`, `?velocity=1`
- `/api/fluids` — new: `{ fluids: [{fluid, amount}] }`, `?velocity=1`, `?history=<fluid>&range=<range>`
- `/api/chemicals` — new: `{ chemicals: [{chemical, amount}] }`, `?velocity=1`, `?history=<chemical>&range=<range>`
- `/api/ae-items?history=<item>&range=<range>` — item history (existing aeItemHistory query)

### Existing patterns to follow:
- Item list rows: `px-4 py-2 flex items-center justify-between`, font-mc classes
- Velocity panels: TOP PRODUCERS / TOP CONSUMERS pattern with progress bars
- Charts: LineChart.astro takes `data` (JSON string of [{time,value}]), `label`, `colour`
- Colours: `text-mc-diamond`, `text-mc-amethyst`, `text-mc-emerald`, `text-mc-gold`, `text-mc-lapis`, `text-mc-copper`, `text-mc-redstone`, `text-mc-white`, `text-mc-muted`
- Panel component: `<Panel title="..." raised noPadding>`
- StatCard: `<StatCard label="..." value={...} colour="..." id="..." />`

### SSR data for initial render:
```typescript
import { aeSummary, aeItems, aeItemVelocity, aeFluids, aeFluidVelocity, aeChemicals, aeChemicalVelocity } from '@/lib/queries';
```

## Implementation

### 1. Add tab navigation to storage.astro header area

After the existing header div, add tab buttons:
```html
<div class="flex gap-1 mb-6" id="storage-tabs">
  <button data-tab="items" class="tab-btn mc-slot px-4 py-2 font-mc text-xs text-mc-diamond">ITEMS</button>
  <button data-tab="fluids" class="tab-btn mc-slot px-4 py-2 font-mc text-xs text-mc-muted">FLUIDS</button>
  <button data-tab="chemicals" class="tab-btn mc-slot px-4 py-2 font-mc text-xs text-mc-muted">CHEMICALS</button>
</div>
```

### 2. Wrap existing item content in `<div id="tab-items">`

Keep all existing item content (stats, velocity panels, item list) but wrap in a tab div.

### 3. Add fluid tab content `<div id="tab-fluids" class="hidden">`

Structure:
- Stats row: Total Fluids (sum of amounts formatted as mB), Unique Types count
- Velocity panels: TOP PRODUCERS · 30m / TOP CONSUMERS · 30m (same pattern as items)
- Fluid list panel titled "FLUIDS" with searchable rows
  - Each row: fluid label (strip mod prefix, replace _ with space), amount in mB (format: if >= 1M show xM mB, else xK mB)
  - Click row to expand inline history chart

### 4. Add chemical tab content `<div id="tab-chemicals" class="hidden">`

Same structure as fluids but for chemicals. Amounts in mB.

### 5. Inline history expansion

When user clicks an item/fluid/chemical row:
- If a history panel is already open for that row, close it (toggle)
- Otherwise, close any open history panel, open a new one below the clicked row
- History panel: contains a LineChart rendered client-side
- Fetch data from appropriate history endpoint
- Show range selector: 1H | 6H | 24H buttons that re-fetch and re-render the chart
- Chart colours: items=diamond, fluids=lapis, chemicals=amethyst

The inline history panel HTML:
```html
<div class="history-panel px-4 py-3 bg-mc-obsidian/50 border-t border-mc-cobble/30">
  <div class="flex items-center gap-2 mb-2">
    <span class="font-mc text-[9px] text-mc-muted">RANGE:</span>
    <button data-range="-1h" class="range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-diamond">1H</button>
    <button data-range="-6h" class="range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">6H</button>
    <button data-range="-24h" class="range-btn mc-slot px-2 py-0.5 font-mc text-[9px] text-mc-muted">24H</button>
    <span class="font-mc text-[9px] text-mc-muted ml-auto history-label"></span>
  </div>
  <div class="history-chart-container h-24 w-full"></div>
</div>
```

For the chart, render an SVG line chart inline (since LineChart.astro is SSR-only). Use this client-side SVG sparkline function:

```typescript
function renderSparkline(container: HTMLElement, points: {time: string; value: number}[], colour: string) {
  if (points.length < 2) {
    container.innerHTML = '<p class="font-mc text-[9px] text-mc-muted">Not enough data</p>';
    return;
  }
  const W = container.clientWidth || 400;
  const H = container.clientHeight || 96;
  const pad = 4;
  const min = Math.min(...points.map(p => p.value));
  const max = Math.max(...points.map(p => p.value));
  const range = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
  const ys = points.map(p => H - pad - ((p.value - min) / range) * (H - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  // Fill area
  const fillD = `${d} L${xs[xs.length-1]!.toFixed(1)},${H} L${xs[0]!.toFixed(1)},${H} Z`;
  const colourVar = `var(--color-mc-${colour})`;
  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <path d="${fillD}" fill="${colourVar}" opacity="0.15"/>
      <path d="${d}" fill="none" stroke="${colourVar}" stroke-width="1.5" opacity="0.9"/>
    </svg>`;
}
```

### 6. SSR: fetch initial fluid and chemical data

In the frontmatter, add alongside existing queries:
```typescript
const [fluidRes, fluidVelRes, chemRes, chemVelRes] = await Promise.allSettled([
  aeFluids(), aeFluidVelocity('-30m', 15),
  aeChemicals(), aeChemicalVelocity('-30m', 15),
]);
const fluids = fluidRes.status === 'fulfilled' ? fluidRes.value : [];
const fluidVelocity = fluidVelRes.status === 'fulfilled' ? fluidVelRes.value : [];
const chemicals = chemRes.status === 'fulfilled' ? chemRes.value : [];
const chemVelocity = chemVelRes.status === 'fulfilled' ? chemVelRes.value : [];
```

### 7. Client-side script

Add to the existing `<script>` block (or a new one):
- Tab switching logic (show/hide tab divs, update button classes)
- Fluid/chemical list rendering functions (same pattern as renderItems)
- loadFluids(), loadChemicals() fetch functions
- Velocity refresh for fluids and chemicals
- Click handler for history row expansion
- renderSparkline function
- Auto-refresh: fluids/chemicals every 60s

### Format helpers
```typescript
function fmtMb(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M mB';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K mB';
  return n.toLocaleString() + ' mB';
}

function fluidLabel(name: string): string {
  return name.replace(/^.*:/, '').replace(/_/g, ' ');
}
```

## Quality Requirements
- All new panels must match the existing pixel-border / font-mc / mc-* colour aesthetic exactly
- No inline styles except for dynamic width/colour values
- Initial render via SSR (Astro frontmatter) — tab content pre-rendered, just hidden
- Client-side only handles: tab switching, search, refresh polling, history expansion
- Do not break any existing functionality on the storage page

## Output
After implementation, run:
```bash
cd /Users/shelfwood/Projects/base.shelfwood.co && npx tsc --noEmit 2>&1 | head -40
```
Output the result and a summary of all changes made. Do NOT commit.
