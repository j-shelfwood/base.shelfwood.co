# Task: Energy Page — Net Flow Chart + Per-Device Drilldown

## Objective
Wire up two currently-dead queries into the energy section of index.astro:
1. `energyNetHistory(range)` — net FE/t over time (gen minus con), never rendered
2. `energyDeviceHistory(name, range)` — per-device stored FE sparklines, endpoint exists but no UI

## Real data context
energy_flow measurement: two detectors (energy_detector_0 at 21550 FE/t, energy_detector_1 at 25142 FE/t)
energy_storage measurement: devices include energy_cell_0, quantumEntangloporter_0, quantumEntangloporter_1
stored_fe swings between ~204M and ~2204M FE depending on server activity

## Step 1 — Verify energyNetHistory exists in queries.ts
grep for `energyNetHistory` — it should be around line 120. If it exists, great. If not, add:
```typescript
export async function energyNetHistory(range = '-1h'): Promise<TimePoint[]> {
  // Computes gen - con per window by summing flow rates grouped by direction
  // Uses energy_flow measurement, field rate_fe_t
  // Since there are two detectors (gen + con), we need to net them
  // The existing energyFlowHistory returns per-name rows — use that and diff in TS
}
```
Actually — energyNetHistory already exists. Just use it.

## Step 2 — Update src/pages/api/energy.ts
Currently returns: `{ summary, flow, pctHistory, storedHistory, flowSeries, devices }`

Add `netHistory` to the parallel fetch:
```typescript
import { energySummary, energyFlow, energyHistory, energyStoredHistory, energyFlowHistory, energyDevices, energyNetHistory } from '@/lib/queries';

const [summary, flow, pctHistory, storedHistory, flowHistory, devices, netHistory] = await Promise.all([
  energySummary(),
  energyFlow(),
  energyHistory(range),
  energyStoredHistory(range),
  energyFlowHistory(range),
  energyDevices(),
  energyNetHistory(range),
]);

return Response.json({ summary, flow, pctHistory, storedHistory, flowSeries, devices, netHistory });
```

## Step 3 — Update src/pages/index.astro SSR

### 3a — Add netHistory to SSR fetch
In the Promise.allSettled array, add `energyNetHistory('-1h')` after `energyDevices()`:
```typescript
import { ..., energyNetHistory } from '@/lib/queries';

// In allSettled:
energyNetHistory('-1h'),  // add after energyDevices()

// Destructure:
const eNetHist = eNetHistRes.status === 'fulfilled' ? eNetHistRes.value : [];
```

### 3b — Add NET FLOW chart to the energy Row 2 grid
Currently Row 2 is: `grid-cols-1 lg:grid-cols-3` with ENERGY STORED | ENERGY STORAGE % | ENERGY DEVICES

Change to 4 columns and add NET FLOW as the first panel:
```astro
<div class="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-6">
  <Panel title="NET FLOW (FE/t)" raised>
    <LineChart data={eNetHist} colour="var(--color-mc-emerald)" height={90} suffix=" FE/t" id="chart-energy-net" />
  </Panel>
  <Panel title="ENERGY STORED (FE)" raised>
    <LineChart data={eStoredHist} colour="var(--color-mc-copper)" height={90} suffix=" FE" id="chart-energy-stored" />
  </Panel>
  <Panel title="ENERGY STORAGE %" raised>
    <ProgressBar value={e?.percent ?? 0} colour="gold" showPercent label="Charge" id="progress-energy" />
    <div class="mt-3">
      <LineChart data={eHist} colour="var(--color-mc-gold)" height={70} suffix="%" id="chart-energy-pct" />
    </div>
  </Panel>
  <Panel title="ENERGY DEVICES" raised>
    ... existing devices list ...
  </Panel>
</div>
```

### 3c — Per-device sparklines in ENERGY DEVICES panel
The devices panel currently shows name + fill% progress bar.
Add a clickable expand to show a mini sparkline per device.

Each device row becomes:
```astro
<div class="flex flex-col gap-1 cursor-pointer device-row" data-device={d.name}>
  <div class="flex justify-between">
    <span class="font-mc text-sm text-mc-white truncate max-w-[60%]">{d.name}</span>
    <span class="font-mc text-sm text-mc-gold">{(d.percent ?? 0).toFixed(0)}%</span>
  </div>
  <div class="mc-progress-track">
    <div class="mc-progress-fill bg-mc-gold" style={`width:${d.percent ?? 0}%`} />
  </div>
  <div class="device-sparkline hidden h-8 w-full" data-device-name={d.name}></div>
</div>
```

### 3d — Client script: device sparkline fetch + net chart range update

In the `<script>` block, before the setInterval calls, add:

```typescript
// ── Per-device energy sparklines ──────────────────────────────────────────
function renderMiniLine(container: HTMLElement, points: {time:string;value:number}[], colour: string) {
  if (points.length < 2) { container.innerHTML = '<span class="font-mc text-xs text-mc-muted">no data</span>'; return; }
  const W = 300, H = 28, pad = 2;
  const vals = points.map(p => p.value);
  const min = Math.min(...vals), max = Math.max(...vals), r = max - min || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
  const ys = points.map(p => H - pad - ((p.value - min) / r) * (H - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  container.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <path d="${d}" fill="none" stroke="${colour}" stroke-width="1.2" opacity="0.8"/>
  </svg>`;
}

document.querySelectorAll<HTMLElement>('.device-row').forEach(row => {
  row.addEventListener('click', async () => {
    const name = row.dataset.device;
    if (!name) return;
    const sparkContainer = row.querySelector('.device-sparkline') as HTMLElement | null;
    if (!sparkContainer) return;
    if (!sparkContainer.classList.contains('hidden')) {
      sparkContainer.classList.add('hidden');
      return;
    }
    sparkContainer.classList.remove('hidden');
    if (sparkContainer.querySelector('svg')) return; // already loaded
    sparkContainer.innerHTML = '<span class="font-mc text-xs text-mc-muted">loading...</span>';
    const data = await fetch(`/api/energy-storage?history=${encodeURIComponent(name)}&range=-1h`).then(r => r.json()).catch(() => null);
    if (data?.history) renderMiniLine(sparkContainer, data.history, 'var(--color-mc-gold)');
  });
});
```

Also update `switchEnergyRange` to redraw the net chart:
```typescript
// In the existing switchEnergyRange function, add after existing redraws:
if (data.netHistory) renderSvgLine('chart-energy-net', data.netHistory, 'var(--color-mc-emerald)', ' FE/t');
```

## Verification
```bash
bun run build
```
Must complete with "Complete!" and zero errors.

## Output
Report in chat:
- Files modified
- Build result
- Note any data quirks observed (e.g. if netHistory returns empty)
