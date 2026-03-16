import type { APIRoute } from 'astro';
import { aeSummary, aeCPUs, aeSummaryHistory } from '@/lib/queries';

const VALID_RANGE = /^-\d+[smhd]$/;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range');
    const range = rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h';

    const [summary, cpus, itemsHistory, energyHistory, storageHistory, fluidsHistory, chemicalsHistory] = await Promise.all([
      aeSummary(),
      aeCPUs(),
      aeSummaryHistory('items_total', range),
      aeSummaryHistory('energy_usage', range),
      aeSummaryHistory('item_storage_used', range),
      aeSummaryHistory('fluids_total', range),
      aeSummaryHistory('chemicals_total', range),
    ]);

    return Response.json({ summary, cpus, itemsHistory, energyHistory, storageHistory, fluidsHistory, chemicalsHistory });
  } catch (err) {
    console.error('ae-summary API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
