import type { APIRoute } from 'astro';
import { energySummary, energyFlow, energyHistory, energyStoredHistory, energyFlowHistory, energyDevices } from '@/lib/queries';

const VALID_RANGE = /^-\d+[smhd]$/;

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const rawRange = url.searchParams.get('range');
    const range = rawRange && VALID_RANGE.test(rawRange) ? rawRange : '-1h';

    const [summary, flow, pctHistory, storedHistory, flowHistory, devices] = await Promise.all([
      energySummary(),
      energyFlow(),
      energyHistory(range),
      energyStoredHistory(range),
      energyFlowHistory(range),
      energyDevices(),
    ]);

    // Split flow history into named series
    const flowNames = [...new Set(flowHistory.map(r => r.name))];
    const flowSeries: Record<string, { time: string; value: number }[]> = {};
    for (const name of flowNames) {
      flowSeries[name] = flowHistory.filter(r => r.name === name).map(r => ({ time: r.time, value: r.value }));
    }

    return Response.json({ summary, flow, pctHistory, storedHistory, flowSeries, devices });
  } catch (err) {
    console.error('energy API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
