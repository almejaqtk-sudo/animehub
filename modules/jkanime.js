const BASE_URL = 'https://jkanime.net';

/* ---------- FILTROS (los mismos que tiene la web en /directorio) ---------- */
// /directorio?genero=accion&tipo=animes&estado=emision&fecha=2024&temporada=verano&p=2
const FILTER_PARAM = {
  genre: 'genero',
  type: 'tipo',
  status: 'estado',
  category: 'categoria',
  demography: 'demografia',
  year: 'fecha',
  season: 'temporada',
  letter: 'letra'
};

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[()]/g, '').trim().replace(/\s+/g, '-');

// Si algún género no devuelve resultados, corrige aquí su slug.
const GENRE_NAMES = [
  'Accion', 'Aventura', 'Autos', 'Comedia', 'Dementia', 'Demonios', 'Misterio', 'Drama', 'Ecchi',
  'Fantasia', 'Juegos', 'Hentai', 'Historico', 'Terror', 'Niños', 'Magia', 'Artes Marciales', 'Mecha',
  'Musica', 'Parodia', 'Samurai', 'Romance', 'Colegial', 'Sci-Fi', 'Shoujo', 'Shoujo Ai', 'Shounen',
  'Shounen Ai', 'Space', 'Deportes', 'Super Poderes', 'Vampiros', 'Yaoi', 'Yuri', 'Harem',
  'Cosas de la vida', 'Sobrenatural', 'Militar', 'Policial', 'Psicologico', 'Thriller', 'Seinen',
  'Josei', 'Español Latino', 'Isekai'
];

const YEARS = [];
for (let y = 2026; y >= 1981; y--) YEARS.push({ v: String(y), t: String(y) });

const LETTERS = ['0-9'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).map((l) => ({ v: l, t: l }));

const FILTERS = [
  { id: 'genre', label: 'Género', multi: false, options: GENRE_NAMES.map((n) => ({ v: slugify(n), t: n })) },
  {
    id: 'type', label: 'Tipo', multi: false,
    options: [
      { v: 'animes', t: 'Animes' }, { v: 'peliculas', t: 'Peliculas' }, { v: 'especiales', t: 'Especiales' },
      { v: 'ovas', t: 'Ovas' }, { v: 'onas', t: 'Onas' }
    ]
  },
  {
    id: 'status', label: 'Estado', multi: false,
    options: [
      { v: 'emision', t: 'En emisión' }, { v: 'finalizados', t: 'Finalizado' }, { v: 'estrenos', t: 'Por Estrenar' }
    ]
  },
  {
    id: 'category', label: 'Categoría', multi: false,
    options: [{ v: 'donghua', t: 'Donghua' }, { v: 'latino', t: 'Latino' }]
  },
  {
    id: 'demography', label: 'Demografía', multi: false,
    options: [
      { v: 'ninos', t: 'Niños' }, { v: 'shoujo', t: 'Shoujo' }, { v: 'shounen', t: 'Shounen' },
      { v: 'seinen', t: 'Seinen' }, { v: 'josei', t: 'Josei' }
    ]
  },
  { id: 'year', label: 'Año', multi: false, options: YEARS },
  {
    id: 'season', label: 'Temporada', multi: false,
    options: [
      { v: 'invierno', t: 'Invierno' }, { v: 'primavera', t: 'Primavera' },
      { v: 'verano', t: 'Verano' }, { v: 'otono', t: 'Otoño' }
    ]
  },
  { id: 'letter', label: 'Letra', multi: false, options: LETTERS }
];

const isNotFound = (e) => !!e && (e.status === 404 || /\b404\b/.test(String(e.message || '')));

// Para detectar "fin de páginas" cuando la web repite la primera página
const firstSeen = new Map();

/* ---------- UTILIDADES ---------- */
function isStaticAsset(url) {
  return /\.(css|js|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot|map)(\?|$)/i.test(url);
}

function detectSourceType(url, hintLabel = '') {
  const combined = `${url} ${hintLabel}`;
  if (/\.m3u8(\?|$)/i.test(url)) return 'hls';
  if (/\.mp4(\?|$)/i.test(url)) return 'mp4';
  if (/(mega\.nz|drive\.google\.com|mediafire\.com|1fichier\.com)/i.test(combined)) {
    return 'external';
  }
  return 'embed';
}

function isPreferredHost(url, label = '') {
  const combined = `${url} ${label}`;
  return /(streamwish|hglink|vidhide|filemoon|mp4upload|ok\.ru|okru|yourupload|streamtape|dood|mega\.nz|mediafire|drive\.google|1fichier|jkanime\.net\/jk\.php|jkanime\.net\/jkfembed|jkanime\.net\/jkokru|jkanime\.net\/jkvmixdrop|jkanime\.net\/jkdesu|\.m3u8|\.mp4)/i.test(
    combined
  );
}

function cleanUrlCandidate(raw, baseUrl) {
  if (!raw) return '';
  let s = String(raw).trim();
  if (!s) return '';

  if (/^[A-Za-z0-9+/=]{24,}$/.test(s) && s.length % 4 === 0) {
    try {
      const decoded = atob(s);
      if (/^https?:\/\//i.test(decoded) || decoded.startsWith('/')) {
        s = decoded.trim();
      }
    } catch (_) {}
  }

  s = s
    .replace(/\\\//g, '/')
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/^["']+|["']+$/g, '')
    .trim();

  if (!s || s.startsWith('javascript:') || s.startsWith('data:') || s.startsWith('blob:')) {
    return '';
  }

  try {
    const full = api.abs(s, baseUrl);
    if (!/^https?:\/\//i.test(full) || isStaticAsset(full)) return '';
    return full;
  } catch (_) {
    return '';
  }
}

function pickText(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.textContent && el.textContent.trim()) {
      return el.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

function pickAttr(doc, selectors, attr) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const val = el ? el.getAttribute(attr) : '';
    if (val && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

function isNavOrCategoryUrl(href) {
  return (
    /\/(?:genero|generos|categoria|categorias|category|tag|directorio|top|horario|estrenos|animes|peliculas|ova)\/?$/i.test(
      href
    ) ||
    href === '/' ||
    href === '/directorio/' ||
    href === '/animes/'
  );
}

function extractSubBadge(card, title) {
  const badges = Array.from(
    card.querySelectorAll('.badge, .type, .idioma, .audio, .quality, .calidad, .meta, .sub, span')
  )
    .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
    .filter((txt) => {
      if (!txt || txt === title || txt.length > 45) return false;
      return /(anime|pel[ií]cula|ova|latino|castellano|sub|hd|ep\.?\s*\d+|episodio\s*\d+|\d{4})/i.test(
        txt
      );
    });

  return badges.length > 0 ? [...new Set(badges)].join(' · ') : undefined;
}

const NAV_SLUGS = /^\/(?:directorio|genero|generos|horario|top|login|registro|buscar|animes|peliculas|ova|estrenos|cuenta|perfil|contacto|dmca|terminos|ayuda|foro|discord|app|apk)\/?$/i;

// loose = true: enlaces genéricos; solo URLs tipo /slug/ que parezcan una tarjeta (imagen o título)
function collectCards(cards, baseUrl, loose) {
  const seen = new Set();
  const items = [];

  for (const card of cards) {
    const link = card.matches('a') ? card : card.querySelector('a[href]');
    const href = link ? (link.getAttribute('href') || '').trim() : '';
    if (!href || href === '#' || href.startsWith('javascript:')) continue;

    const absUrl = api.abs(href, baseUrl);
    if (seen.has(absUrl)) continue;

    let path = '';
    try {
      const parsed = new URL(absUrl);
      if (parsed.hostname !== new URL(baseUrl).hostname) continue;
      path = parsed.pathname;
    } catch (_) {}
    if (isNavOrCategoryUrl(path)) continue;
    if (loose) {
      if (!/^\/[^/]+\/?$/.test(path) || NAV_SLUGS.test(path)) continue;
      if (!card.querySelector('img, [data-setbg], h2, h3, h4, h5')) continue;
    } else if (/^\/[^/]+\/\d+\/?$/.test(path) && !card.matches('.anime__item, article, .item')) {
      continue; // enlaces a episodios (/slug/1/)
    }

    const img = card.querySelector('img');
    const bg = card.querySelector('[data-setbg]');
    const coverRaw =
      img?.getAttribute('data-src') ||
      img?.getAttribute('data-lazy-src') ||
      img?.getAttribute('src') ||
      (bg ? bg.getAttribute('data-setbg') : '') ||
      '';
    const cover = coverRaw ? api.abs(coverRaw, baseUrl) : '';

    const title = (
      card.querySelector('h2, h3, h4, h5, .title, .entry-title, .name, .anime__item__text h5 a')?.textContent ||
      img?.getAttribute('alt') ||
      link?.getAttribute('title') ||
      link?.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (!title || /^cargando/i.test(title)) continue;
    if (!loose && !cover && !card.matches('.anime__item, article, .item, .anime-card')) continue;

    seen.add(absUrl);
    items.push({ title, cover, url: absUrl, sub: extractSubBadge(card, title) });
  }

  return items;
}

// Plan B: tarjetas cuyo título es un <h5><a> y la imagen está aparte (o como fondo CSS), sin depender de clases
function parseByHeadings(doc, baseUrl) {
  const items = [];
  const seen = new Set();
  let host = '';
  try { host = new URL(baseUrl).hostname; } catch (_) { return items; }
  const bgFromStyle = (el) => {
    const m = (el.getAttribute('style') || '').match(/url\((['"]?)(.*?)\1\)/i);
    return m ? m[2] : '';
  };

  for (const h of doc.querySelectorAll('h2, h3, h4, h5, h6')) {
    const a = h.querySelector('a[href]') || h.closest('a[href]');
    if (!a) continue;
    let url = '';
    let path = '';
    try {
      const u = new URL(api.abs((a.getAttribute('href') || '').trim(), baseUrl));
      if (u.hostname !== host) continue;
      url = u.href;
      path = u.pathname;
    } catch (_) { continue; }
    if (!/^\/[^/]+\/?$/.test(path) || NAV_SLUGS.test(path) || isNavOrCategoryUrl(path)) continue;
    if (seen.has(url)) continue;

    const title = (h.textContent || '').replace(/\s+/g, ' ').trim();
    if (!title || /^cargando/i.test(title)) continue;

    // Subir hasta un contenedor con imagen, sin llegar a abarcar otras tarjetas
    let box = h.parentElement;
    let scope = box;
    let cover = '';
    for (let i = 0; i < 4 && box; i++) {
      if (box.querySelectorAll('h2, h3, h4, h5, h6').length > 1) break;
      scope = box;
      const img = box.querySelector('img');
      const bg = box.querySelector('[data-setbg]');
      const st = box.querySelector('[style*="url("]');
      const raw =
        (img && (img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('src'))) ||
        (bg && bg.getAttribute('data-setbg')) ||
        (st && bgFromStyle(st)) ||
        '';
      if (raw) { cover = api.abs(raw, baseUrl); break; }
      box = box.parentElement;
    }

    const txt = ((scope && scope.textContent) || '').replace(/\s+/g, ' ');
    const m = txt.match(/\b(Serie|ONA|OVA|Pel[ií]cula|Especial)\b\s*(En emisi[oó]n|Concluido|Por estrenar)?/i);

    seen.add(url);
    items.push({ title, cover, url, sub: m ? m[0].trim() : undefined });
  }
  return items;
}

// Prueba cada selector y devuelve el primero que realmente produce tarjetas
function parseList(doc, baseUrl) {
  const selectors = ['.anime__item', '.anime-card', 'article', '.item', '.post', '.grid article', '.grid .item'];
  for (const sel of selectors) {
    const cards = Array.from(doc.querySelectorAll(sel));
    if (cards.length === 0) continue;
    const items = collectCards(cards, baseUrl, false);
    if (items.length > 0) return items;
  }
  const byHead = parseByHeadings(doc, baseUrl);
  if (byHead.length > 0) return byHead;
  return collectCards(Array.from(doc.querySelectorAll('a[href]')), baseUrl, true);
}

// Resumen de la página para diagnosticar cuando no se encuentran tarjetas
function diag(doc, u) {
  const links = Array.from(doc.querySelectorAll('a[href]'));
  const withImg = links
    .filter((a) => a.querySelector('img, [data-setbg]'))
    .slice(0, 3)
    .map((a) => (a.getAttribute('href') || '').slice(0, 50))
    .join(' | ');
  const body = doc.body ? (doc.body.textContent || '').replace(/\s+/g, ' ').trim() : '';
  const h5 = doc.querySelector('h5');
  const sample = h5 && h5.parentElement ? (h5.parentElement.outerHTML || '').replace(/\s+/g, ' ').slice(0, 220) : '-';
  return `${u} · título «${(doc.title || '').slice(0, 40)}» · enlaces ${links.length} · .anime__item ${doc.querySelectorAll('.anime__item').length} · img ${doc.querySelectorAll('img').length} · muestra: ${withImg || '-'} · h5 ${doc.querySelectorAll('h5').length} · html h5: ${sample} · texto: ${body.slice(0, 90)}`;
}

/* ---------- RESPALDO: el directorio carga sus tarjetas con JS ---------- */
const XHR_OPTS = { headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json, text/html, */*' } };

// Busca en cualquier JSON objetos con título + enlace/slug y los convierte en tarjetas
function itemsFromJson(data, baseUrl) {
  const out = [];
  const seen = new Set();
  const walk = (node, depth) => {
    if (!node || depth > 7) return;
    if (Array.isArray(node)) { node.forEach((n) => walk(n, depth + 1)); return; }
    if (typeof node !== 'object') return;
    const slug = node.slug || node.url || node.href || node.link;
    const title = node.title || node.titulo || node.name || node.nombre;
    if (typeof slug === 'string' && slug && typeof title === 'string' && title.trim()) {
      const path = /^https?:|^\//.test(slug) ? slug : `/${slug}/`;
      const url = api.abs(path, baseUrl);
      if (!seen.has(url)) {
        seen.add(url);
        const coverRaw = node.image || node.imagen || node.poster || node.cover || node.thumbnail || node.img || '';
        const tipo = node.type || node.tipo;
        out.push({
          title: title.replace(/\s+/g, ' ').trim(),
          cover: typeof coverRaw === 'string' && coverRaw ? api.abs(coverRaw, baseUrl) : '',
          url,
          sub: typeof tipo === 'string' ? tipo : undefined
        });
      }
      return;
    }
    Object.values(node).forEach((v) => walk(v, depth + 1));
  };
  walk(data, 0);
  return out;
}

function htmlStringsFromJson(data) {
  const out = [];
  const walk = (n, d) => {
    if (d > 7 || n == null) return;
    if (typeof n === 'string') { if (n.length > 50 && n.includes('<')) out.push(n); return; }
    if (typeof n === 'object') Object.values(n).forEach((v) => walk(v, d + 1));
  };
  walk(data, 0);
  return out;
}

// Interpreta una respuesta que puede ser JSON, un fragmento HTML o una página completa
function parseAny(text, baseUrl) {
  const t = (text || '').trim();
  if (!t) return [];
  if (t[0] === '{' || t[0] === '[') {
    try {
      const j = JSON.parse(t);
      const direct = itemsFromJson(j, baseUrl);
      if (direct.length > 0) return direct;
      for (const frag of htmlStringsFromJson(j)) {
        const items = parseList(new DOMParser().parseFromString(frag, 'text/html'), baseUrl);
        if (items.length > 0) return items;
      }
      return [];
    } catch (_) {}
  }
  return parseList(new DOMParser().parseFromString(t, 'text/html'), baseUrl);
}

// Rutas de ajax / api que aparecen dentro de los scripts de la página
function findEndpoints(htmlText, pageUrl) {
  const found = [];
  const re = /["'`]((?:https?:\/\/(?:[a-z0-9-]+\.)?jkanime\.net)?\/[A-Za-z0-9_\-\/.]*(?:ajax|api|directorio|filtrar|filter)[A-Za-z0-9_\-\/.?=&%]*)["'`]/gi;
  let m;
  while ((m = re.exec(htmlText || ''))) {
    const raw = m[1];
    if (isStaticAsset(raw) || /login\.|google|auth|comentarios|ajax_search/i.test(raw)) continue;
    let full = '';
    try { full = api.abs(raw, pageUrl); } catch (_) { continue; }
    if (full.split('?')[0].replace(/\/+$/, '') === pageUrl.split('?')[0].replace(/\/+$/, '')) continue;
    if (!found.includes(full)) found.push(full);
    if (found.length >= 6) break;
  }
  return found;
}

async function tryDynamic(pageUrl, endpoints, params, page) {
  const qs = params.concat([`p=${page}`, `page=${page}`]).join('&');
  const candidates = [pageUrl].concat(
    endpoints.map((ep) => `${ep}${ep.includes('?') ? '&' : '?'}${qs}`)
  );
  for (const c of candidates) {
    try {
      const text = await api.text(c, XHR_OPTS);
      const items = parseAny(text, c);
      if (items.length > 0) return items;
    } catch (_) {}
  }
  return [];
}

// La web numera los estados (en el título aparece "estado 2")
const STATUS_NUM = { emision: '1', finalizados: '2', estrenos: '3' };

function extractEpisodes(doc, htmlText, pageUrl) {
  const episodes = [];
  const seenUrls = new Set();
  const seenNumbers = new Set();

  const cleanBase = pageUrl.replace(/\/+$/, '');
  const slug = cleanBase.split('/').pop() || '';
  const slugRe = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const addEpisode = (number, title, epUrl) => {
    const num = Number(number);
    if (!Number.isFinite(num) || num <= 0) return;
    const fullUrl = epUrl ? api.abs(epUrl, pageUrl) : `${cleanBase}/${num}/`;
    if (seenUrls.has(fullUrl) && seenNumbers.has(num)) return;
    seenUrls.add(fullUrl);
    seenNumbers.add(num);
    episodes.push({
      number: num,
      title: (title || `Episodio ${num}`).replace(/\s+/g, ' ').trim(),
      url: fullUrl
    });
  };

  // 1. Enlaces típicos de JKAnime: https://jkanime.net/<slug>/<num>/
  const links = Array.from(doc.querySelectorAll('a[href]'));
  for (const a of links) {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || href === '#' || href.startsWith('javascript:')) continue;

    const absHref = api.abs(href, pageUrl);
    if (absHref.replace(/\/+$/, '') === cleanBase) continue;

    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const aria = (a.getAttribute('aria-label') || a.getAttribute('title') || '').trim();
    const combined = `${text} ${aria}`.trim();

    const looksLikeEp =
      (slug && new RegExp(`/${slugRe}/\\d+(?:\\.\\d+)?/?`, 'i').test(absHref)) ||
      /\/(?:episodio|ep|cap|capitulo|ver|watch)[\/-]/i.test(absHref) ||
      /\b(?:episodio|ep\.?|cap\.?|capítulo|capitulo)\s*\d+/i.test(combined);

    if (!looksLikeEp) continue;

    const numMatch =
      (slug && absHref.match(new RegExp(`/${slugRe}/(\\d+(?:\\.\\d+)?)/?`, 'i'))) ||
      absHref.match(/(?:episodio|ep|cap|capitulo)[-_\/](\d+(?:\.\d+)?)/i) ||
      absHref.match(/\/(\d+(?:\.\d+)?)\/?(?:\?.*)?$/) ||
      combined.match(/(?:episodio|ep\.?|cap\.?|capítulo|capitulo)\s*(\d+(?:\.\d+)?)/i) ||
      combined.match(/\b(\d+(?:\.\d+)?)\b/);

    if (numMatch) {
      addEpisode(numMatch[1], text || aria || `Episodio ${numMatch[1]}`, absHref);
    }
  }

  // 2. Atributos data-*
  const dataEls = Array.from(
    doc.querySelectorAll('[data-episode], [data-ep], [data-cap], [data-href], [data-url], [data-slug]')
  );
  for (const el of dataEls) {
    const epAttr =
      el.getAttribute('data-episode') || el.getAttribute('data-ep') || el.getAttribute('data-cap') || '';
    const hrefAttr = el.getAttribute('data-href') || el.getAttribute('data-url') || '';
    const slugAttr = el.getAttribute('data-slug') || '';
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();

    const numMatch =
      epAttr.match(/(\d+(?:\.\d+)?)/) ||
      hrefAttr.match(/(?:episodio|ep|cap)[-_\/](\d+(?:\.\d+)?)/i) ||
      hrefAttr.match(/\/(\d+(?:\.\d+)?)\/?$/) ||
      slugAttr.match(/\/(\d+(?:\.\d+)?)$/) ||
      txt.match(/(?:episodio|ep\.?|cap\.?)\s*(\d+(?:\.\d+)?)/i);

    if (numMatch) {
      const targetUrl = hrefAttr
        ? api.abs(hrefAttr, pageUrl)
        : slugAttr
          ? api.abs(slugAttr.startsWith('/') ? slugAttr : `/${slugAttr}`, BASE_URL)
          : `${cleanBase}/${numMatch[1]}/`;
      addEpisode(numMatch[1], txt || `Episodio ${numMatch[1]}`, targetUrl);
    }
  }

  // 3. Fallback en HTML / scripts
  if (episodes.length === 0 && htmlText) {
    const unescaped = htmlText.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    const pattern = slug
      ? new RegExp(`https?:\\/\\/[^\\s"'<>]+\\/${slugRe}\\/\\d+(?:\\.\\d+)?\\/?`, 'gi')
      : /https?:\/\/[^\s"'<>]+(?:\/episodio\/|\/ver\/|ep-|cap-)[^\s"'<>]*/gi;
    const matches = unescaped.match(pattern) || [];
    for (const u of matches) {
      const m = u.match(/\/(\d+(?:\.\d+)?)\/?(?:\?.*)?$/);
      if (m) addEpisode(m[1], `Episodio ${m[1]}`, u);
    }
  }

  // 4. Si se abre directamente una URL de episodio (/slug/num/)
  if (episodes.length === 0 && /\/[^/]+\/\d+\/?$/.test(pageUrl)) {
    const m = pageUrl.match(/\/(\d+(?:\.\d+)?)\/?$/);
    const epNum = m ? m[1] : 1;
    addEpisode(epNum, pickText(doc, ['h1', 'title']) || `Episodio ${epNum}`, pageUrl);
  }

  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

return {
  id: 'jkanime',
  name: 'JKAnime',
  version: 6,

  filters: FILTERS,

  async home(page = 1) {
    const urlsToTry =
      page > 1
        ? [
            api.abs(`/directorio/${page}/`, BASE_URL),
            api.abs(`/animes/page/${page}/`, BASE_URL),
            api.abs(`/page/${page}/`, BASE_URL)
          ]
        : [api.abs('/', BASE_URL), api.abs('/directorio/', BASE_URL)];

    for (const u of urlsToTry) {
      try {
        const doc = await api.html(u);
        const list = parseList(doc, u);
        if (list.length > 0) return list;
      } catch (_) {}
    }

    return [];
  },

  async search(query, page = 1, filters = {}) {
    const q = (query || '').trim();

    const sel = {};
    const params = [];
    for (const id of Object.keys(FILTER_PARAM)) {
      const v = filters && filters[id];
      const val = Array.isArray(v) ? v[0] : v;
      if (val) {
        sel[id] = val;
        params.push(`${FILTER_PARAM[id]}=${encodeURIComponent(val)}`);
      }
    }

    let key;
    let paths = [];
    if (q) {
      // Con texto se usa el buscador de la web (solo admite texto)
      const encQ = encodeURIComponent(q.replace(/\s+/g, '_'));
      key = `q:${q}`;
      paths =
        page > 1
          ? [`/buscar/${encQ}/${page}/`, `/?s=${encQ}&paged=${page}`]
          : [`/buscar/${encQ}/`, `/?s=${encQ}`];
    } else {
      key = `d:${params.join('&')}`;
      // Solo género: la web lista /genero/<slug>?p=N (comprobado)
      if (sel.genre && params.length === 1) {
        paths.push(`/genero/${encodeURIComponent(sel.genre)}?p=${page}`);
      }
      // Con más filtros: directorio
      paths.push(`/directorio?${params.concat([`p=${page}`]).join('&')}`);
      // Formato antiguo del directorio: /directorio/<pagina>/<tipo|estado>/ (solo si hay un único filtro de tipo o estado)
      if (params.length === 1 && (sel.type || sel.status)) {
        paths.push(`/directorio/${page}/${encodeURIComponent(sel.type || sel.status)}/`);
      }
      // Variante con el estado numérico (1, 2, 3)
      if (sel.status && STATUS_NUM[sel.status]) {
        const alt = params.map((x) =>
          x.startsWith('estado=') ? `estado=${STATUS_NUM[sel.status]}` : x
        );
        paths.push(`/directorio?${alt.concat([`p=${page}`]).join('&')}`);
      }
    }

    let lastErr = null;
    let lastDiag = '';
    for (const path of paths) {
      try {
        const u = api.abs(path, BASE_URL);
        const text = await api.text(u);
        const doc = new DOMParser().parseFromString(text, 'text/html');
        let list = parseList(doc, u);
        let eps = [];
        if (list.length === 0 && !q) {
          // El directorio carga las tarjetas con JS: probar la misma URL como petición ajax y rutas halladas en los scripts
          eps = findEndpoints(text, u);
          list = await tryDynamic(u, eps, params, page);
        }
        if (list.length === 0) {
          lastDiag = `${diag(doc, u)} · rutas JS: ${eps.slice(0, 4).join(' | ') || '-'}`;
          continue;
        }

        if (page === 1) {
          firstSeen.set(key, list[0].url);
        } else if (firstSeen.get(key) === list[0].url) {
          return []; // la web repite la primera página: ya no hay más
        }
        return list;
      } catch (e) {
        if (page > 1 && isNotFound(e)) return [];
        lastErr = e;
      }
    }

    // Primera página sin resultados: mostrar el motivo en vez de una lista vacía muda
    if (page === 1) {
      if (lastDiag) throw new Error(`Sin tarjetas · ${lastDiag}`);
      if (lastErr) throw new Error(`No se pudo cargar (${lastErr.message})`);
    }
    return [];
  },

  async details(url) {
    const absUrl = api.abs(url, BASE_URL);
    const htmlText = await api.text(absUrl);
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');

    const title = pickText(doc, ['h1', '.anime__details__title h3', '.entry-title', '.title', 'header h1', 'main h1']);
    const coverRaw =
      pickAttr(doc, ['.anime__details__pic'], 'data-setbg') ||
      pickAttr(doc, ['meta[property="og:image"]'], 'content') ||
      pickAttr(doc, ['.anime__details__pic img', '.poster img', '.cover img', 'article img', 'main img'], 'src');
    const cover = coverRaw ? api.abs(coverRaw, absUrl) : '';

    const bannerRaw = pickAttr(doc, ['.banner img', '.backdrop img', '.bg img'], 'src');
    const banner = bannerRaw ? api.abs(bannerRaw, absUrl) : undefined;

    const description = pickText(doc, [
      '.anime__details__text p',
      '.synopsis',
      '.description',
      '.entry-content p',
      '[class*="synopsis"]',
      '[class*="description"]',
      'p'
    ]);

    const genres = Array.from(
      doc.querySelectorAll(
        'a[href*="/genero/"], a[href*="/generos/"], a[href*="/genre/"], a[href*="genre="], .genres a, .tags a'
      )
    )
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);

    const metaText = doc.body ? doc.body.textContent || '' : '';
    const yearMatch = metaText.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? Number(yearMatch[1]) : undefined;

    let status;
    if (/en emisi[oó]n/i.test(metaText)) {
      status = 'En emisión';
    } else if (/finalizado|completado/i.test(metaText)) {
      status = 'Finalizado';
    }

    const episodes = extractEpisodes(doc, htmlText, absUrl);

    return {
      title,
      cover,
      banner,
      description,
      genres: [...new Set(genres)],
      year,
      status,
      episodes
    };
  },

  async videos(episodeUrl, ctx) {
    const absUrl = api.abs(episodeUrl, BASE_URL);
    const html = await api.text(absUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const candidates = [];
    const seen = new Set();

    const add = (rawUrl, hintLabel = '', forceType = '') => {
      const full = cleanUrlCandidate(rawUrl, absUrl);
      if (!full || seen.has(full)) return;
      if (full.replace(/\/+$/, '') === absUrl.replace(/\/+$/, '')) return;
      seen.add(full);

      let hostLabel = '';
      try {
        hostLabel = new URL(full).hostname.replace(/^www\./i, '');
      } catch (_) {}

      const label = (hintLabel || hostLabel || `Servidor ${candidates.length + 1}`).trim();
      const type = forceType || detectSourceType(full, label);
      candidates.push({ label, url: full, type });
    };

    // 1. Iframes
    doc.querySelectorAll('iframe').forEach((iframe, idx) => {
      const src =
        iframe.getAttribute('src') || iframe.getAttribute('data-src') || iframe.getAttribute('data-lazy-src') || '';
      const label =
        iframe.getAttribute('data-server') ||
        iframe.getAttribute('data-label') ||
        iframe.getAttribute('title') ||
        `Iframe ${idx + 1}`;
      add(src, label, 'embed');
    });

    // 2. Video / Source
    doc.querySelectorAll('video, video source').forEach((el, idx) => {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      const label = el.getAttribute('label') || `Video ${idx + 1}`;
      add(src, label);
    });

    // 3. Atributos data-*
    const dataAttrs = [
      'data-src', 'data-url', 'data-embed', 'data-player', 'data-link', 'data-video', 'data-file', 'data-iframe'
    ];
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of dataAttrs) {
        const val = el.getAttribute(attr);
        if (val) {
          const hint =
            el.getAttribute('data-server') ||
            el.getAttribute('data-name') ||
            el.getAttribute('title') ||
            el.textContent?.trim() ||
            '';
          add(val, hint);
        }
      }
    });

    // 4. Enlaces directos, embeds internos de JKAnime y base64
    const unescaped = html.replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');

    const mediaRegex =
      /https?:\/\/[^\s"'<>`\\)]+(?:\.m3u8|\.mp4|\/embed\/|\/e\/|\/player\/|\/v\/|\/watch\?|\/jk\.php|\/jkfembed|\/jkokru|\/jkvmixdrop|\/jkdesu|mega\.nz\/|drive\.google\.com\/|mediafire\.com\/|1fichier\.com\/)[^\s"'<>`\\)]*/gi;
    const matched = unescaped.match(mediaRegex) || [];
    matched.forEach((u, idx) => add(u, `Fuente ${idx + 1}`));

    const b64Matches = unescaped.match(/["']([A-Za-z0-9+/=]{32,})["']/g) || [];
    for (const token of b64Matches) {
      add(token.slice(1, -1), 'Servidor codificado');
    }

    const preferred = candidates.filter((item) => isPreferredHost(item.url, item.label));
    return preferred.length > 0 ? preferred : candidates;
  }
};
