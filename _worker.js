/* Fesify - Cloudflare Pages Edge Function (Universal /api Handler) */

const YTM = 'https://music.youtube.com/youtubei/v1';
const CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.00.00',
    hl: 'id',
    gl: 'ID',
  },
};
const HEADERS = {
  'Content-Type': 'application/json',
  'X-YouTube-Client-Name': '67',
  'X-YouTube-Client-Version': '1.20240101.00.00',
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

async function yt(endpoint, body = {}, query = '') {
  const res = await fetch(YTM + '/' + endpoint + '?prettyPrint=false' + query, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ context: CONTEXT, ...body }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error('YTM ' + endpoint + ' -> ' + res.status + ' (' + errText.slice(0, 150) + ')');
  }
  return res.json();
}

function findAll(obj, key, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) findAll(v, key, out);
    return out;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) out.push(obj[k]);
    findAll(obj[k], key, out);
  }
  return out;
}
const findFirst = (obj, key) => findAll(obj, key)[0];
const text = (o) =>
  o && o.runs ? o.runs.map((r) => r.text).join('') : (o && o.simpleText) || '';

function normalizeDuration(s) {
  const t = String(s || '').trim();
  if (/^\d{1,2}(\.\d{2}){1,2}$/.test(t)) return t.replace(/\./g, ':');
  return t;
}

function runsInfo(o) {
  const out = [];
  if (!o || !o.runs) return out;
  for (const r of o.runs) {
    const be = r.navigationEndpoint && r.navigationEndpoint.browseEndpoint;
    if (be) out.push({ name: r.text, browseId: be.browseId });
  }
  return out;
}

function thumbs(o) {
  const t = findAll(o, 'thumbnails')
    .flat()
    .filter((x) => x && x.url);
  if (!t.length) return null;
  const best = t.reduce((a, b) => ((b.width || 0) >= (a.width || 0) ? b : a));
  return upscale(best.url);
}
function upscale(url) {
  if (!url) return url;
  if (url.includes('googleusercontent.com')) return url.replace(/=w\d+-h\d+.*$/, '=w544-h544-l90-rj');
  return url;
}

function endpointInfo(nav) {
  if (!nav) return {};
  const we = nav.watchEndpoint;
  const be = nav.browseEndpoint;
  const wpe = nav.watchPlaylistEndpoint;
  if (we) return { videoId: we.videoId, playlistId: we.playlistId };
  if (wpe) return { playlistId: wpe.playlistId, watchPlaylist: true };
  if (be) {
    const id = be.browseId;
    let type = 'browse';
    if (id.startsWith('MPRE')) type = 'album';
    else if (id.startsWith('UC') || id.startsWith('MPLA')) type = 'artist';
    else if (id.startsWith('VL') || id.startsWith('PL') || id.startsWith('RDCLAK')) type = 'playlist';
    return { browseId: id, browseType: type };
  }
  return {};
}

function parseTwoRow(r) {
  const nav = r.navigationEndpoint || {};
  let info = endpointInfo(nav);
  if (!info.browseId && r.title && r.title.runs) {
    const tNav = r.title.runs[0] && r.title.runs[0].navigationEndpoint;
    const extra = endpointInfo(tNav || {});
    if (extra.browseId) info = { ...info, ...extra };
  }
  let type = 'song';
  if (info.browseType === 'album' || info.browseType === 'playlist' || info.browseType === 'artist') type = info.browseType;
  else if (info.videoId) type = 'song';
  else if (info.playlistId || info.watchPlaylist) type = 'playlist';
  const item = {
    type,
    title: text(r.title),
    subtitle: text(r.subtitle),
    thumbnail: thumbs(r.thumbnailRenderer),
    artists: runsInfo(r.subtitle),
    ...info,
  };
  if (r.thumbnailRenderer && findFirst(r, 'musicThumbnailRenderer')) {
    const style = findFirst(r, 'musicThumbnailRenderer').thumbnailCrop;
    if (style === 'MUSIC_THUMBNAIL_CROP_CIRCLE') item.type = 'artist';
  }
  return item;
}

function parseListItem(r) {
  const cols = (r.flexColumns || []).map((c) =>
    c.musicResponsiveListItemFlexColumnRenderer ? c.musicResponsiveListItemFlexColumnRenderer.text : null
  );
  const title = cols[0] ? text(cols[0]) : '';
  const subtitle = cols
    .slice(1)
    .map((c) => text(c))
    .filter(Boolean)
    .join(' • ');
  let videoId = null;
  if (r.playlistItemData) videoId = r.playlistItemData.videoId;
  if (!videoId && cols[0] && cols[0].runs) {
    const we = cols[0].runs[0] && cols[0].runs[0].navigationEndpoint && cols[0].runs[0].navigationEndpoint.watchEndpoint;
    if (we) videoId = we.videoId;
  }
  if (!videoId) {
    const we = findFirst(r.overlay || {}, 'watchEndpoint');
    if (we) videoId = we.videoId;
  }
  const navInfo = endpointInfo(r.navigationEndpoint);
  const artists = [];
  const albums = [];
  for (const c of cols.slice(1)) {
    for (const e of runsInfo(c)) {
      if (e.browseId.startsWith('MPRE')) albums.push(e);
      else artists.push(e);
    }
  }
  let type = videoId ? 'song' : navInfo.browseType || 'song';
  const item = {
    type,
    title,
    subtitle,
    videoId,
    thumbnail: thumbs(r.thumbnail),
    artists,
    album: albums[0] || null,
    ...navInfo,
  };
  const fixed = findFirst(r, 'musicResponsiveListItemFixedColumnRenderer');
  if (fixed) item.duration = normalizeDuration(text(fixed.text));
  return item;
}

function parseSections(contents) {
  const sections = [];
  for (const s of contents || []) {
    const car = s.musicCarouselShelfRenderer;
    const shelf = s.musicShelfRenderer;
    if (car) {
      const header = findFirst(car.header || {}, 'title');
      const items = (car.contents || [])
        .map((c) =>
          c.musicTwoRowItemRenderer
            ? parseTwoRow(c.musicTwoRowItemRenderer)
            : c.musicResponsiveListItemRenderer
            ? parseListItem(c.musicResponsiveListItemRenderer)
            : null
        )
        .filter((x) => x && x.title);
      if (items.length) sections.push({ title: text(header), items });
    } else if (shelf) {
      const items = (shelf.contents || [])
        .map((c) => (c.musicResponsiveListItemRenderer ? parseListItem(c.musicResponsiveListItemRenderer) : null))
        .filter((x) => x && x.title);
      if (items.length) sections.push({ title: text(shelf.title), items, list: true });
    }
  }
  return sections;
}

const SEARCH_PARAMS = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=',
};

function displayTitle(t) {
  const raw = String(t || '').trim();
  if (!raw) return '';
  return raw
    .replace(/\s*[\(\[]\s*(official\s*)?(hd\s*)?(4k\s*)?(music\s*)?(lyric(s)?\s*)?(audio|video|visualizer|mv)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*-\s*(official|lyric(s)?|audio|video|visualizer|topic).*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || raw;
}

async function handleApiRequest(request, url) {
  const path = url.pathname.replace(/^\/api\/?/, '');

  try {
    // 1. /api/home
    if (path === 'home') {
      let d = await yt('browse', { browseId: 'FEmusic_home' });
      let sections = [];
      let sl = findFirst(d, 'sectionListRenderer');
      if (sl) sections = parseSections(sl.contents);
      sections = sections.filter((s) => {
        const title = String(s.title || '').toLowerCase();
        return !title.includes('remembering') && !title.includes('in memoriam') && !title.includes('tribute to');
      });
      return json({ sections });
    }

    // 2. /api/charts
    if (path === 'charts') {
      const d = await yt('browse', { browseId: 'FEmusic_charts' });
      const sl = findFirst(d, 'sectionListRenderer');
      return json({ sections: sl ? parseSections(sl.contents) : [] });
    }

    // 3. /api/moods
    if (path === 'moods') {
      const d = await yt('browse', { browseId: 'FEmusic_moods_and_genres' });
      const cats = findAll(d, 'musicNavigationButtonRenderer').map((b) => ({
        title: text(b.buttonText),
        color: b.solid ? '#' + (b.solid.leftStripeColor >>> 0).toString(16).padStart(8, '0').slice(2) : null,
        browseId: b.clickCommand && b.clickCommand.browseEndpoint && b.clickCommand.browseEndpoint.browseId,
        params: b.clickCommand && b.clickCommand.browseEndpoint && b.clickCommand.browseEndpoint.params,
      }));
      return json({ categories: cats.filter((c) => c.browseId) });
    }

    // 4. /api/search
    if (path === 'search') {
      const q = String(url.searchParams.get('q') || '').trim();
      if (!q) return json({ sections: [] });
      const filter = url.searchParams.get('filter');
      const body = { query: q };
      if (filter && SEARCH_PARAMS[filter]) body.params = SEARCH_PARAMS[filter];
      const d = await yt('search', body);
      const sections = [];
      const shelves = findAll(d, 'musicShelfRenderer');
      for (const shelf of shelves) {
        const items = (shelf.contents || [])
          .map((c) => (c.musicResponsiveListItemRenderer ? parseListItem(c.musicResponsiveListItemRenderer) : null))
          .filter((x) => x && x.title);
        if (items.length) sections.push({ title: text(shelf.title), items });
      }
      const top = findFirst(d, 'musicCardShelfRenderer');
      if (top) {
        const info = endpointInfo(findFirst(top.title || {}, 'navigationEndpoint') || (top.title.runs && top.title.runs[0].navigationEndpoint));
        sections.unshift({
          title: 'Top result',
          items: [{
            type: info.videoId ? 'song' : info.browseType || 'song',
            title: text(top.title),
            subtitle: text(top.subtitle),
            thumbnail: thumbs(top.thumbnail),
            ...info,
          }],
        });
      }
      return json({ sections });
    }

    // 5. /api/suggest
    if (path === 'suggest') {
      const d = await yt('music/get_search_suggestions', { input: url.searchParams.get('q') || '' });
      const sugg = findAll(d, 'searchSuggestionRenderer').map((s) => text(s.suggestion));
      return json({ suggestions: sugg });
    }    // 6. /api/next
    if (path === 'next') {
      const vid = url.searchParams.get('videoId');
      const plId = url.searchParams.get('playlistId');
      const body = { isAudioOnly: true, tunerSettingValue: 'AUTOMIX_SETTING_NORMAL' };
      if (vid) {
        body.videoId = vid;
        body.playlistId = plId || ('RDAMVM' + vid);
      } else if (plId) {
        body.playlistId = plId;
      }
      const d = await yt('next', body);
      const panels = findAll(d, 'playlistPanelVideoRenderer');
      const queue = panels.map((p) => ({
        videoId: p.videoId,
        title: displayTitle(text(p.title)),
        artist: text(p.shortBylineText || p.longBylineText),
        artists: runsInfo(p.longBylineText),
        duration: text(p.lengthText),
        thumbnail: thumbs(p.thumbnail),
        selected: !!p.selected,
      }));
      let lyricsBrowseId = null;
      let relatedBrowseId = null;
      for (const tab of findAll(d, 'tabRenderer')) {
        const id = tab.endpoint && tab.endpoint.browseEndpoint && tab.endpoint.browseEndpoint.browseId;
        if (!id) continue;
        if (id.startsWith('MPLYt')) lyricsBrowseId = id;
        if (id.startsWith('MPTRt')) relatedBrowseId = id;
      }
      return json({ queue, lyricsBrowseId, relatedBrowseId });
    }

    // 7. /api/browse
    if (path === 'browse') {
      let id = url.searchParams.get('id') || '';
      if (/^(PL|RDCLAK|VLPL|OLAK)/.test(id) && !id.startsWith('VL')) id = 'VL' + id;
      const body = { browseId: id };
      const params = url.searchParams.get('params');
      if (params) body.params = params;
      const d = await yt('browse', body);
      const hResp = findFirst(d, 'musicResponsiveHeaderRenderer') || findFirst(d, 'musicDetailHeaderRenderer');
      let header = null;
      if (hResp) {
        header = {
          title: text(hResp.title),
          subtitle: [text(hResp.subtitle), text(hResp.secondSubtitle)].filter(Boolean).join(' • '),
          thumbnail: thumbs(hResp.thumbnail || {}),
        };
      }
      let tracks = [];
      const shelves = findAll(d, 'musicShelfRenderer').concat(findAll(d, 'musicPlaylistShelfRenderer'));
      for (const shelf of shelves) {
        const items = (shelf.contents || [])
          .map((c) => (c.musicResponsiveListItemRenderer ? parseListItem(c.musicResponsiveListItemRenderer) : null))
          .filter((x) => x && x.title);
        if (items.length && !tracks.length) tracks = items;
      }
      return json({ header, tracks, sections: parseSections(findFirst(d, 'sectionListRenderer')?.contents || []) });
    }

    // 8. /api/sponsorblock
    if (path === 'sponsorblock') {
      const vid = String(url.searchParams.get('videoId') || '');
      const cats = encodeURIComponent(JSON.stringify(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic']));
      const r = await fetch('https://sponsor.ajay.app/api/skipSegments?videoID=' + encodeURIComponent(vid) + '&categories=' + cats);
      if (!r.ok) return json({ segments: [] });
      const arr = await r.json();
      return json({ segments: (arr || []).filter((s) => s.actionType === 'skip').map((s) => ({ category: s.category, start: s.segment[0], end: s.segment[1] })) });
    }

    return json({ error: 'Endpoint not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
    if (url.pathname.startsWith('/api/')) return handleApiRequest(req, url);
    if (env && env.ASSETS) return env.ASSETS.fetch(req);
    return fetch(req);
  }
};
