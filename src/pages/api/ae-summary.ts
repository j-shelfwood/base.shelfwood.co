import type { APIRoute } from 'astro';
import { aeSummary, aeCPUs } from '@/lib/queries';

export const GET: APIRoute = async () => {
  try {
    const [summary, cpus] = await Promise.all([
      aeSummary(),
      aeCPUs(),
    ]);

    return Response.json({ summary, cpus });
  } catch (err) {
    console.error('ae-summary API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
