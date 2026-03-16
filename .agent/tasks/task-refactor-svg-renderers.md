# Task: Unify SVG Chart Renderers

## Objective

Merge `renderSvgLine`, `renderMiniLine`, and `renderDualSvg` in `src/pages/index.astro` `<script>` into a single `renderChart` function. All three do identical SVG path math — they differ only in having one vs two series and whether they show a fill area.

## Discovery

```bash
grep -n "function render\|renderSvgLine\|renderMiniLine\|renderDualSvg" src/pages/index.astro
```

Read those three functions in full to confirm the shared math.

## Current functions (approximate lines)

Read `src/pages/index.astro` around:
- `renderSvgLine` (~30 lines) — single series, fill + stroke, updates label row
- `renderMiniLine` (~20 lines) — single series, stroke only, no labels, smaller H
- `renderDualSvg` (~35 lines) — two series, both strokes, shared time axis

## Implementation

Replace all three with one `renderChart` function:

```typescript
type Series = { points: { time: string; value: number }[]; colour: string; fill?: boolean; suffix?: string };

function renderChart(containerId: string, series: Series[], options: { height?: number } = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const allPoints = series.flatMap(s => s.points);
  if (allPoints.length < 2) return;

  const existingSvg = el.querySelector('svg');
  const H = options.height ?? (existingSvg ? (parseInt(existingSvg.getAttribute('height') ?? '') || 80) : 80);
  const W = 400, pad = 6;

  // Build SVG paths per series
  const paths = series.map(({ points, colour, fill }) => {
    if (points.length < 2) return '';
    const vals = points.map(p => p.value);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const vRange = maxV - minV || 1;
    const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
    const ys = points.map(p => H - pad - ((p.value - minV) / vRange) * (H - pad * 2));
    const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
    const fillPath = fill !== false
      ? `<path d="${d} L${xs[xs.length-1]!.toFixed(1)},${H} L${xs[0]!.toFixed(1)},${H} Z" fill="${colour}" opacity="0.15"/>`
      : '';
    return `${fillPath}<path d="${d}" fill="none" stroke="${colour}" stroke-width="1.5" opacity="0.9"/>`;
  }).join('');

  const svg = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${paths}</svg>`;
  if (existingSvg) existingSvg.outerHTML = svg;
  else el.insertAdjacentHTML('afterbegin', svg);

  // Update labels row if present (min / current / max)
  const labelsRow = el.querySelector('div.flex.justify-between');
  if (labelsRow && series[0]) {
    const { points, suffix = '' } = series[0];
    const vals = points.map(p => p.value);
    const spans = labelsRow.querySelectorAll('span');
    if (spans.length >= 3) {
      spans[0]!.textContent = fmtChartVal(Math.min(...vals)) + suffix;
      spans[1]!.textContent = fmtChartVal(vals[vals.length - 1]!) + suffix;
      spans[2]!.textContent = fmtChartVal(Math.max(...vals)) + suffix;
    }
  }
}
```

## Migration — replace all call sites

After defining `renderChart`, replace all existing calls:

**`renderSvgLine(id, points, colour, suffix)` → `renderChart(id, [{ points, colour, suffix, fill: true }])`**

**`renderMiniLine(container, points, colour)` → inline or:**
The `renderMiniLine` function takes a container element, not an ID. Keep it as a thin wrapper:
```typescript
function renderMiniLine(container: HTMLElement, points: { time: string; value: number }[], colour: string) {
  // Give it a temporary ID trick or just inline the renderChart logic for element
  if (points.length < 2) return;
  const H = 32, W = 200, pad = 2;
  const vals = points.map(p => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const vRange = maxV - minV || 1;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (W - pad * 2));
  const ys = points.map(p => H - pad - ((p.value - minV) / vRange) * (H - pad * 2));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  container.innerHTML = `<svg width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${colour}" stroke-width="1" opacity="0.7"/></svg>`;
}
```

**`renderDualSvg(id, ptsA, ptsB, colA, colB)` → `renderChart(id, [{ points: ptsA, colour: colA }, { points: ptsB, colour: colB }])`**

Find all `renderSvgLine` calls in the file and replace each with the equivalent `renderChart` call.
Find all `renderDualSvg` calls and replace with `renderChart`.

## IMPORTANT
- Delete the old `renderSvgLine` and `renderDualSvg` function bodies after migrating all call sites
- Keep `renderMiniLine` as a thin wrapper (takes element not ID, fixed small size)
- `fmtChartVal` must remain defined before `renderChart` since it's used inside it

## Verification
```bash
bun run build
```
Zero errors required.

## Output
Report: old function line counts removed, renderChart lines added, all call sites migrated, build result.
