import type { APIRoute } from 'astro';
import { craftingJobs, aeCPUs, craftingTaskCount, craftingTaskHistory, craftingCpuHistory } from '@/lib/queries';

const VALID_RANGE = /^-\d+[smhd]$/;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range');
    const range = rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h';

    const [jobs, cpus, taskCount, taskHistory, cpuHistory] = await Promise.all([
      craftingJobs(),
      aeCPUs(),
      craftingTaskCount(),
      craftingTaskHistory(range),
      craftingCpuHistory(range),
    ]);

    return Response.json({ jobs, cpus, taskCount, taskHistory, cpuHistory });
  } catch (err) {
    console.error('crafting API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
