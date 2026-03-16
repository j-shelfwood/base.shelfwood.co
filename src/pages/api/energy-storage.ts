import type { APIRoute } from 'astro';
import { energyDevices, energyDeviceHistory } from '@/lib/queries';

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const historyName = url.searchParams.get('history');
    const range = url.searchParams.get('range') ?? '-1h';

    if (historyName) {
      const data = await energyDeviceHistory(historyName, range);
      return new Response(JSON.stringify({ history: data }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const devices = await energyDevices();
    return new Response(JSON.stringify({ devices }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
