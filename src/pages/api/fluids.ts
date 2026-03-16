import type { APIRoute } from 'astro';
import { aeFluids, aeFluidVelocity, aeFluidHistory } from '@/lib/queries';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const velocity = url.searchParams.get('velocity') === '1';
    const historyFluid = url.searchParams.get('history');
    const range = url.searchParams.get('range') ?? '-30m';

    if (historyFluid) {
      const data = await aeFluidHistory(historyFluid, range);
      return new Response(JSON.stringify({ history: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (velocity) {
      const data = await aeFluidVelocity(range);
      return new Response(JSON.stringify({ velocity: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fluids = await aeFluids();
    return new Response(JSON.stringify({ fluids }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
