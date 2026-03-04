import type { APIRoute } from 'astro';
import { aeItems, aeItemHistory } from '@/lib/queries';

export const GET: APIRoute = async ({ url }) => {
  try {
    const q = url.searchParams.get('q') || undefined;
    const item = url.searchParams.get('item');
    const range = url.searchParams.get('range') || '-1h';

    if (item) {
      const history = await aeItemHistory(item, range);
      return Response.json({ history });
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
