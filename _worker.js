/* Fesify - Cloudflare Worker entry. /api/* is served by the shared core in lib/api.js
   (same code as the Express server), everything else by the static assets binding. */
import { handle } from './lib/api.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    if (url.pathname.startsWith('/api/')) {
      const res = await handle(url.pathname.slice('/api/'.length), url.searchParams);
      const out = new Response(res.body, res);
      for (const [k, v] of Object.entries(CORS_HEADERS)) out.headers.set(k, v);
      return out;
    }
    if (env && env.ASSETS) return env.ASSETS.fetch(req);
    return fetch(req);
  },
};
