import type { APIRoute } from 'astro';
import { aeItems, aeItemHistory, aeItemVelocity } from '@/lib/queries';

// Valid Flux duration format: -N[smhd]
const VALID_RANGE = /^-\d+[smhd]$/;

export const GET: APIRoute = async ({ url }) => {
  try {
    // Sanitise inputs before interpolation into Flux queries.
    // Strip quotes/backslashes from free-text search; cap length.
    const rawQ = url.searchParams.get('q');
    const q = rawQ ? rawQ.slice(0, 100).replace(/['"\\]/g, '') : undefined;

    // item tag is interpolated directly into a filter — strip Flux-special chars
    const rawItem = url.searchParams.get('item');
    const item = rawItem ? rawItem.slice(0, 200).replace(/['"\\]/g, '') : null;

    // range is interpolated into |> range(start: ...) — whitelist format only
    const rawRange = url.searchParams.get('range');
    const range = rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h';

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
