import type { APIRoute } from 'astro';
import { energySummary, energyFlow } from '@/lib/queries';

export const GET: APIRoute = async () => {
  try {
    const [summary, flow] = await Promise.all([
      energySummary(),
      energyFlow(),
    ]);

    return Response.json({ summary, flow });
  } catch (err) {
    console.error('energy API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
