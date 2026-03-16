import type { APIRoute } from 'astro';
import { craftingJobs, aeCPUs, craftingTaskCount, craftingTaskHistory } from '@/lib/queries';

export const GET: APIRoute = async () => {
  try {
    const [jobs, cpus, taskCount, taskHistory] = await Promise.all([
      craftingJobs(),
      aeCPUs(),
      craftingTaskCount(),
      craftingTaskHistory('-1h'),
    ]);

    return Response.json({ jobs, cpus, taskCount, taskHistory });
  } catch (err) {
    console.error('crafting API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
