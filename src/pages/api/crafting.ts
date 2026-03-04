import type { APIRoute } from 'astro';
import { craftingJobs, aeCPUs } from '@/lib/queries';

export const GET: APIRoute = async () => {
  try {
    const [jobs, cpus] = await Promise.all([
      craftingJobs(),
      aeCPUs(),
    ]);

    return Response.json({ jobs, cpus });
  } catch (err) {
    console.error('crafting API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
