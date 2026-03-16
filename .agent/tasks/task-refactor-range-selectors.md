# Task: Refactor Range Selectors — Generic Factory

## Objective

Replace the 6+ near-identical range selector blocks in `src/pages/index.astro` `<script>` with a single `setupRangeSelector` factory function. Each block currently:
1. Queries all buttons of a class
2. On click: updates button active styles
3. Fetches an API endpoint with `?range=`
4. Calls `renderSvgLine` for one or more chart IDs

## Discovery

```bash
# Count range selector blocks
grep -n "range-btn\|RangeBtn\|range-btn\|addEventListener.*click" src/pages/index.astro | head -60
```

Read `src/pages/index.astro` lines 1380–1540 to see all range selector blocks.

## The Pattern (repeated 6+ times)

Each block looks like this:
```typescript
document.querySelectorAll<HTMLButtonElement>('.foo-range-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const range = btn.dataset.fooRange ?? '-1h';
    document.querySelectorAll<HTMLButtonElement>('.foo-range-btn').forEach(b => {
      b.className = 'foo-range-btn mc-slot px-2 py-0.5 font-mc text-sm ' + (b === btn ? 'text-mc-active' : 'text-mc-muted');
    });
    const data = await fetch(`/api/endpoint?range=${range}`).then(r => r.json()).catch(() => null);
    if (data?.someHistory) renderSvgLine('chart-id', data.someHistory, 'colour', 'suffix');
    if (data?.otherHistory) renderSvgLine('chart-id2', data.otherHistory, 'colour2');
  });
});
```

## Implementation

Add a `setupRangeSelector` helper ONCE near the top of the `<script>` block (after `renderSvgLine` is defined):

```typescript
type ChartSpec = {
  dataKey: string;
  chartId: string;
  colour: string;
  suffix?: string;
};

function setupRangeSelector(
  btnClass: string,
  dataAttr: string,
  apiUrl: (range: string) => string,
  charts: ChartSpec[],
  activeColour = 'text-mc-emerald'
) {
  document.querySelectorAll<HTMLButtonElement>(`.${btnClass}`).forEach(btn => {
    btn.addEventListener('click', async () => {
      const range = btn.dataset[dataAttr] ?? '-1h';
      document.querySelectorAll<HTMLButtonElement>(`.${btnClass}`).forEach(b => {
        b.className = `${btnClass} mc-slot px-2 py-0.5 font-mc text-sm ` +
          (b === btn ? activeColour : 'text-mc-muted');
      });
      const data = await fetch(apiUrl(range)).then(r => r.json()).catch(() => null);
      if (!data) return;
      for (const { dataKey, chartId, colour, suffix } of charts) {
        if (data[dataKey]) renderSvgLine(chartId, data[dataKey], colour, suffix ?? '');
      }
    });
  });
}
```

Then replace each existing block with a `setupRangeSelector` call. Here are all 6:

```typescript
// Machine active count
setupRangeSelector('mach-range-btn', 'machRange', r => `/api/machines?range=${r}`, [
  { dataKey: 'activityHistory', chartId: 'chart-mach-activity', colour: 'var(--color-mc-emerald)' },
]);

// Machine active %
setupRangeSelector('mach-pct-range-btn', 'machPctRange', r => `/api/machines?range=${r}`, [
  { dataKey: 'activityPctHistory', chartId: 'chart-mach-active-pct', colour: 'var(--color-mc-gold)', suffix: '%' },
], 'text-mc-gold');

// Mod history
setupRangeSelector('mod-range-btn', 'modRange', r => `/api/machines?range=${r}`, [
  { dataKey: 'mekHistory', chartId: 'chart-mek-history', colour: 'var(--color-mc-amethyst)' },
  { dataKey: 'miHistory',  chartId: 'chart-mi-history',  colour: 'var(--color-mc-diamond)' },
]);

// Task queue
setupRangeSelector('queue-range-btn', 'queueRange', r => `/api/crafting?range=${r}`, [
  { dataKey: 'taskHistory', chartId: 'chart-task-queue', colour: 'var(--color-mc-gold)' },
], 'text-mc-gold');

// CPU utilization
setupRangeSelector('cpu-range-btn', 'cpuRange', r => `/api/crafting?range=${r}`, [
  { dataKey: 'cpuHistory', chartId: 'chart-cpu-util', colour: 'var(--color-mc-amethyst)', suffix: '%' },
], 'text-mc-amethyst');
```

The energy range selector (`switchEnergyRange`) and AE range selector (`switchAERange`) are more complex (loading spinners, button style classes differ) — leave those as-is.

## IMPORTANT — data-* attribute casing

The HTML uses `data-mach-range`, `data-mach-pct-range` etc. In JavaScript `dataset`, hyphenated names become camelCase:
- `data-mach-range` → `dataset.machRange`
- `data-mach-pct-range` → `dataset.machPctRange`
- `data-mod-range` → `dataset.modRange`
- `data-queue-range` → `dataset.queueRange`
- `data-cpu-range` → `dataset.cpuRange`

The `dataAttr` parameter passed to `setupRangeSelector` must use the camelCase form.

## Verification
```bash
bun run build
```
Must complete with zero errors.

## Output
Report: lines removed, lines added, build result.
