import type { APIRoute } from 'astro';
import { machineSummary, machineTypes, mekanismMachines, miMachines, miMachineGroups } from '@/lib/queries';

export const GET: APIRoute = async () => {
  try {
    const [summary, types, mekanism, mi, miGroups] = await Promise.all([
      machineSummary(),
      machineTypes(),
      mekanismMachines(),
      miMachines(),
      miMachineGroups(),
    ]);

    return Response.json({ summary, types, mekanism, mi, miGroups });
  } catch (err) {
    console.error('machines API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
