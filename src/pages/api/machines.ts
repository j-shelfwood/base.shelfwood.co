import type { APIRoute } from 'astro';
import { machineSummary, machineTypes, mekanismMachines, miMachines } from '@/lib/queries';

export const GET: APIRoute = async () => {
  try {
    const [summary, types, mekanism, mi] = await Promise.all([
      machineSummary(),
      machineTypes(),
      mekanismMachines(),
      miMachines(),
    ]);

    return Response.json({ summary, types, mekanism, mi });
  } catch (err) {
    console.error('machines API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
