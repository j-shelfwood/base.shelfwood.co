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
