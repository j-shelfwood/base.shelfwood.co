import type { APIRoute } from 'astro';
import { aeChemicals, aeChemicalVelocity, aeChemicalHistory } from '@/lib/queries';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const velocity = url.searchParams.get('velocity') === '1';
    const historyChemical = url.searchParams.get('history');
    const range = url.searchParams.get('range') ?? '-30m';

    if (historyChemical) {
      const data = await aeChemicalHistory(historyChemical, range);
      return new Response(JSON.stringify({ history: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (velocity) {
      const data = await aeChemicalVelocity(range);
      return new Response(JSON.stringify({ velocity: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const chemicals = await aeChemicals();
    return new Response(JSON.stringify({ chemicals }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
