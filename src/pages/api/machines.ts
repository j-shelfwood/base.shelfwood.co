import type { APIRoute } from 'astro';
import { machineSummary, machineTypes, mekanismMachines, miMachines, machineActivityHistory, machineActivePercentHistory, miMachineSlotItems, miMachineFluids, machineTypeHistory, modActivityHistory } from '@/lib/queries';

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

    // If typeHistory param given, return just that series
    if (typeHistParam) {
      const history = await machineTypeHistory(typeHistParam, range);
      return Response.json({ history });
    }

    const [summary, types, mekanism, mi, activityHistory, activityPctHistory, slotItems, fluids, mekHistory, miHistory] = await Promise.all([
      machineSummary(),
      machineTypes(),
      mekanismMachines(),
      miMachines(),
      machineActivityHistory(range),
      machineActivePercentHistory(range),
      miMachineSlotItems(),
      miMachineFluids(),
      modActivityHistory('mekanism', range),
      modActivityHistory('modern_industrialization', range),
    ]);

    return Response.json({ summary, types, mekanism, mi, activityHistory, activityPctHistory, slotItems, fluids, mekHistory, miHistory });
  } catch (err) {
    console.error('machines API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
