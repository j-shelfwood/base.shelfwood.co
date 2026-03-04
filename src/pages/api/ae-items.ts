import type { APIRoute } from 'astro';
import { aeItems, aeItemHistory, aeItemVelocity } from '@/lib/queries';

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('q') || undefined;
    const item = url.searchParams.get('item');
    const range = url.searchParams.get('range') || '-1h';
    const velocity = url.searchParams.get('velocity');

    if (item) {
      const history = await aeItemHistory(item, range);
      return Response.json({ history });
    }

    if (velocity) {
      const data = await aeItemVelocity('-30m', 15);
      return Response.json({ velocity: data });
    }

    const items = await aeItems(q);
    return Response.json({ items });
  } catch (err) {
    console.error('ae-items API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
