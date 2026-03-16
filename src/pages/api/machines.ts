import type { APIRoute } from 'astro';
import { machineSummary, machineTypes, mekanismMachines, miMachines, machineActivityHistory, miMachineSlotItems } from '@/lib/queries';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const range = url.searchParams.get('range') ?? '-1h';

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
