import type { APIRoute } from 'astro';
import { machineSummary, machineTypes, mekanismMachines, miMachines, machineActivityHistory, machineActivePercentHistory, miMachineSlotItems, miMachineFluids, machineTypeHistory, modActivityHistory, machineUtilisation, machineSparkline } from '@/lib/queries';

const VALID_RANGE = /^-\d+[smhd]$/;
const MAX_RANGE_DAYS = 30;

function capRange(range: string): string {
  const match = range.match(/^-(\d+)([smhd])$/);
  if (!match) return range;
  const n = parseInt(match[1]!);
  const unit = match[2];
  const days = unit === 's' ? n / 86400 : unit === 'm' ? n / 1440 : unit === 'h' ? n / 24 : n;
  if (days > MAX_RANGE_DAYS) return `-${MAX_RANGE_DAYS}d`;
  return range;
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range');
    const range = capRange(rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h');
    const typeHistParam = url.searchParams.get('typeHistory');

    // If sparkline param given, return single machine time series
    const sparklineParam = url.searchParams.get('sparkline');
    if (sparklineParam) {
      const sparkline = await machineSparkline(sparklineParam, range);
      return Response.json({ sparkline });
    }

    // If typeHistory param given, return just that series
    if (typeHistParam) {
      const history = await machineTypeHistory(typeHistParam, range);
      return Response.json({ history });
    }

    const historyOnly = url.searchParams.get('history') === '1';

    if (historyOnly) {
      // Slow path: range queries only — called separately after grid renders
      const [activityHistory, activityPctHistory, mekHistory, miHistory, utilisation] = await Promise.all([
        machineActivityHistory(range),
        machineActivePercentHistory(range),
        modActivityHistory('mekanism', range),
        modActivityHistory('modern_industrialization', range),
        machineUtilisation(range),
      ]);
      return Response.json({ activityHistory, activityPctHistory, mekHistory, miHistory, utilisation });
    }

    // Fast path: current-state queries only (last() — no range scan)
    const [summary, types, mekanism, mi, slotItems, fluids] = await Promise.all([
      machineSummary(),
      machineTypes(),
      mekanismMachines(),
      miMachines(),
      miMachineSlotItems(),
      miMachineFluids(),
    ]);

    return Response.json({ summary, types, mekanism, mi, slotItems, fluids });
  } catch (err) {
    console.error('machines API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
