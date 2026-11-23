const BASE_URL = 'https://latanime.org';

/* ---------- FILTROS ----------
   La web (/animes) tiene un formulario con: Año, Géneros, Letra y Categoría.
   Se leen del propio HTML (nombre del campo + valores reales de cada <option>),
   así no hay que adivinar los nombres de los parámetros. */
const FIELD_LABELS = [
  [/gen/i, 'Género'],
  [/fecha|year|a[nñ]o/i, 'Año'],
  [/letr/i, 'Letra'],
  [/cat/i, 'Categoría'],
  [/tipo|type/i, 'Tipo'],
  [/estado|status/i, 'Estado']
];

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');

// Solo se usa si no se pudo leer el formulario de la web (nombres de campo supuestos)
const FALLBACK_GENRES = [
  'Acción', 'Aventura', 'Carreras', 'Ciencia Ficción', 'Comedia', 'Cyberpunk', 'Deportes', 'Drama', 'Ecchi',
  'Escolares', 'Fantasía', 'Gore', 'Harem', 'Horror', 'Josei', 'Lucha', 'Magia', 'Mecha', 'Militar', 'Misterio',
  'Música', 'Parodias', 'Psicológico', 'Recuerdos de la vida', 'Seinen', 'Shojo', 'Shonen', 'Sobrenatural',
  'Vampiros', 'Yaoi', 'Yuri', 'Latino', 'Espacial', 'Histórico', 'Samurai', 'Artes Marciales', 'Demonios',
  'Romance', 'Dementia', 'Policía', 'Castellano', 'Historia paralela', 'Aenime', 'Donghua', 'Blu-ray',
  'Monogatari', 'Suspenso', 'Isekai'
];

function fallbackFilters() {
  const years = [];
  for (let y = 2026; y >= 1982; y--) years.push({ v: String(y), t: String(y) });
  const letters = ['0-9'].concat('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')).map((l) => ({ v: l, t: l }));
  return [
    { id: 'genero', label: 'Género', multi: false, options: FALLBACK_GENRES.map((n) => ({ v: slugify(n), t: n })) },
    { id: 'fecha', label: 'Año', multi: false, options: years },
    { id: 'letra', label: 'Letra', multi: false, options: letters }
  ];
}

let FORM = null; // { action, filters }
const firstSeen = new Map(); // para detectar "fin de páginas" si la web repite la primera

async function loadForm() {
  if (FORM) return FORM;
  const doc = await api.html(api.abs('/animes', BASE_URL));
  const filters = [];
  let action = '/animes';

  for (const sel of Array.from(doc.querySelectorAll('select'))) {
    const name = (sel.getAttribute('name') || sel.getAttribute('id') || '').trim();
    if (!name) continue;

    const options = [];
    for (const o of Array.from(sel.querySelectorAll('option'))) {
      const t = (o.textContent || '').replace(/\s+/g, ' ').trim();
      const v = o.hasAttribute('value') ? (o.getAttribute('value') || '').trim() : t;
      if (!v || /^seleccionar$/i.test(t)) continue;
      options.push({ v, t: t || v });
    }
    if (options.length === 0) continue;

    const form = sel.closest('form');
    if (form && form.getAttribute('action')) action = form.getAttribute('action');

    const idAttr = sel.getAttribute('id');
    const labelEl = idAttr ? doc.querySelector(`label[for="${idAttr}"]`) : null;
    const labelTxt = ((labelEl && labelEl.textContent) || '').replace(/\s+/g, ' ').trim();
    const hit = FIELD_LABELS.find(([re]) => re.test(name));

    filters.push({ id: name, label: (hit && hit[1]) || labelTxt || name, multi: false, options });
  }

  FORM = { action, filters: filters.length > 0 ? filters : fallbackFilters() };
  return FORM;
}

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
  return /(streamwish|hglink|vidhide|filemoon|mp4upload|ok\.ru|okru|yourupload|streamtape|dood|mega\.nz|mediafire|drive\.google|1fichier|\.m3u8|\.mp4)/i.test(
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
    /\/(?:genero|generos|categoria|categorias|category|tag|emision|estrenos|directorio|animes|peliculas|ova)\/?$/i.test(
      href
    ) ||
    href === '/' ||
    href === '/emision/' ||
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

function parseList(doc, baseUrl) {
  const cardSelectors = [
    'article',
    '.anime-card',
    '.item',
    '.post',
    '.grid article',
    '.grid .item',
    'a[href*="/anime/"]',
    'a[href*="/ver/"]'
  ];

  let cards = [];
  for (const sel of cardSelectors) {
    const found = Array.from(doc.querySelectorAll(sel));
    if (found.length > 0) {
      cards = found;
      break;
    }
  }

  const seen = new Set();
  const items = [];

  for (const card of cards) {
    const link = card.matches('a')
      ? card
      : card.querySelector('a[href*="/anime/"], a[href*="/ver/"], a');
    const href = link ? (link.getAttribute('href') || '').trim() : '';
    if (!href || href === '#' || href.startsWith('javascript:')) continue;

    const absUrl = api.abs(href, baseUrl);
    if (seen.has(absUrl)) continue;

    try {
      const parsed = new URL(absUrl);
      if (isNavOrCategoryUrl(parsed.pathname)) continue;
    } catch (_) {}

    seen.add(absUrl);

    const img = card.querySelector('img');
    const coverRaw =
      img?.getAttribute('data-src') ||
      img?.getAttribute('data-lazy-src') ||
      img?.getAttribute('src') ||
      '';
    const cover = coverRaw ? api.abs(coverRaw, baseUrl) : '';

    const title = (
      card.querySelector('h2, h3, h4, .title, .entry-title, .name')?.textContent ||
      img?.getAttribute('alt') ||
      link?.getAttribute('title') ||
      link?.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (!title || /^cargando/i.test(title)) continue;

    const sub = extractSubBadge(card, title);

    items.push({
      title,
      cover,
      url: absUrl,
      sub
    });
  }

  return items;
}

// Resumen de la página para diagnosticar cuando no se encuentran tarjetas
function diag(doc, u) {
  const links = doc.querySelectorAll('a[href]').length;
  const anime = doc.querySelectorAll('a[href*="/anime/"]').length;
  const body = doc.body ? (doc.body.textContent || '').replace(/\s+/g, ' ').trim() : '';
  return `${u} · título «${(doc.title || '').slice(0, 40)}» · enlaces ${links} · /anime/ ${anime} · img ${doc.querySelectorAll('img').length} · texto: ${body.slice(0, 90)}`;
}

function extractEpisodes(doc, htmlText, pageUrl) {
  const episodes = [];
  const seenUrls = new Set();
  const seenNumbers = new Set();

  const cleanBase = pageUrl.replace(/\/+$/, '');
  const slugMatch = cleanBase.match(/\/anime\/([^/?#]+)/i);
  const slug = slugMatch ? slugMatch[1] : cleanBase.split('/').pop() || '';

  const addEpisode = (number, title, epUrl) => {
    const num = Number(number);
    if (!Number.isFinite(num) || num <= 0) return;
    const fullUrl = epUrl ? api.abs(epUrl, pageUrl) : `${cleanBase.replace('/anime/', '/ver/')}-${num}`;
    if (seenUrls.has(fullUrl) && seenNumbers.has(num)) return;
    seenUrls.add(fullUrl);
    seenNumbers.add(num);
    episodes.push({
      number: num,
      title: (title || `Episodio ${num}`).replace(/\s+/g, ' ').trim(),
      url: fullUrl
    });
  };

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
      /\/(?:ver|episodio|ep|cap|capitulo|watch)[\/-]/i.test(absHref) ||
      (slug && absHref.includes(`/ver/${slug}`) && /-\d+(?:\.\d+)?\/?(?:\?.*)?$/.test(absHref)) ||
      (slug && absHref.includes(slug) && /[-/]\d+(?:\.\d+)?\/?(?:\?.*)?$/.test(absHref)) ||
      /\b(?:episodio|ep\.?|cap\.?|capítulo|capitulo)\s*\d+/i.test(combined);

    if (!looksLikeEp) continue;

    const numMatch =
      absHref.match(/(?:episodio|ep|cap|capitulo)[-_\/](\d+(?:\.\d+)?)/i) ||
      absHref.match(/-(\d+(?:\.\d+)?)\/?(?:\?.*)?$/) ||
      absHref.match(/\/(\d+(?:\.\d+)?)\/?(?:\?.*)?$/) ||
      combined.match(/(?:episodio|ep\.?|cap\.?|capítulo|capitulo)\s*(\d+(?:\.\d+)?)/i) ||
      combined.match(/\b(\d+(?:\.\d+)?)\b/);

    if (numMatch) {
      addEpisode(numMatch[1], text || aria || `Episodio ${numMatch[1]}`, absHref);
    }
  }

  const dataEls = Array.from(
    doc.querySelectorAll('[data-episode], [data-ep], [data-cap], [data-href], [data-url], [data-slug]')
  );
  for (const el of dataEls) {
    const epAttr =
      el.getAttribute('data-episode') ||
      el.getAttribute('data-ep') ||
      el.getAttribute('data-cap') ||
      '';
    const hrefAttr = el.getAttribute('data-href') || el.getAttribute('data-url') || '';
    const slugAttr = el.getAttribute('data-slug') || '';
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();

    const numMatch =
      epAttr.match(/(\d+(?:\.\d+)?)/) ||
      hrefAttr.match(/(?:episodio|ep|cap)[-_\/](\d+(?:\.\d+)?)/i) ||
      hrefAttr.match(/[-/](\d+(?:\.\d+)?)\/?$/) ||
      slugAttr.match(/[-/](\d+(?:\.\d+)?)$/) ||
      txt.match(/(?:episodio|ep\.?|cap\.?)\s*(\d+(?:\.\d+)?)/i);

    if (numMatch) {
      const targetUrl = hrefAttr
        ? api.abs(hrefAttr, pageUrl)
        : slugAttr
          ? api.abs(slugAttr.startsWith('/') ? slugAttr : `/ver/${slugAttr}`, BASE_URL)
          : `${cleanBase.replace('/anime/', '/ver/')}-${numMatch[1]}`;
      addEpisode(numMatch[1], txt || `Episodio ${numMatch[1]}`, targetUrl);
    }
  }

  if (episodes.length === 0 && htmlText) {
    const unescaped = htmlText.replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    const matches =
      unescaped.match(/https?:\/\/[^\s"'<>]+(?:\/ver\/|\/episodio\/|ep-|cap-)[^\s"'<>]*/gi) || [];
    for (const u of matches) {
      const m =
        u.match(/(?:episodio|ep|cap)[-_\/](\d+(?:\.\d+)?)/i) ||
        u.match(/-(\d+(?:\.\d+)?)\/?(?:\?.*)?$/);
      if (m) {
        addEpisode(m[1], `Episodio ${m[1]}`, u);
      }
    }
  }

  if (episodes.length === 0 && /\/ver\//i.test(pageUrl)) {
    const m = pageUrl.match(/-(\d+(?:\.\d+)?)\/?$/);
    const epNum = m ? m[1] : 1;
    addEpisode(epNum, pickText(doc, ['h1', 'title']) || `Episodio ${epNum}`, pageUrl);
  }

  episodes.sort((a, b) => a.number - b.number);
  return episodes;
}

return {
  id: 'latanime',
  name: 'LatAnime',
  version: 3,

  // Filtros reales: se leen del formulario de /animes (Año, Géneros, Letra, Categoría)
  async getFilters() {
    const form = await loadForm();
    return form.filters;
  },

  async home(page = 1) {
    const urlsToTry =
      page > 1
        ? [
            api.abs(`/animes?p=${page}`, BASE_URL),
            api.abs(`/animes/page/${page}/`, BASE_URL),
            api.abs(`/emision/page/${page}/`, BASE_URL),
            api.abs(`/page/${page}/`, BASE_URL)
          ]
        : [
            api.abs('/', BASE_URL),
            api.abs('/emision/', BASE_URL),
            api.abs('/animes/', BASE_URL)
          ];

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
    let key;
    const paths = [];

    if (q) {
      // Con texto se usa el buscador de la web (solo admite texto)
      const enc = encodeURIComponent(q);
      key = `q:${q}`;
      paths.push(
        `/buscar?q=${enc}&p=${page}`,
        `/buscar?q=${enc}&page=${page}`,
        `/animes?q=${enc}&p=${page}`,
        `/?s=${enc}&paged=${page}`
      );
    } else {
      // Sin texto: listado solo por filtros
      let form = null;
      try {
        form = await loadForm();
      } catch (_) {}

      const params = [];
      let genreVal = '';
      for (const [id, v] of Object.entries(filters || {})) {
        const val = Array.isArray(v) ? v[0] : v;
        if (!val) continue;
        params.push(`${encodeURIComponent(id)}=${encodeURIComponent(val)}`);
        if (/gen/i.test(id)) genreVal = String(val);
      }
      key = `d:${params.join('&')}`;

      // Solo género: la web lista /genero/<slug>?p=N
      if (genreVal && params.length === 1 && /^[a-z0-9-]+$/i.test(genreVal) && !/^\d+$/.test(genreVal)) {
        paths.push(`/genero/${encodeURIComponent(genreVal)}?p=${page}`);
      }

      // Directorio con todos los filtros (nombres de campo tomados del formulario real)
      const action = (form && form.action) || '/animes';
      paths.push(`${action}${action.includes('?') ? '&' : '?'}${params.concat([`p=${page}`]).join('&')}`);
    }

    let lastErr = null;
    let lastDiag = '';
    for (const path of paths) {
      try {
        const u = api.abs(path, BASE_URL);
        const doc = await api.html(u);
        const list = parseList(doc, u);
        if (list.length === 0) {
          lastDiag = diag(doc, u);
          continue;
        }

        if (page === 1) {
          firstSeen.set(key, list[0].url);
        } else if (firstSeen.get(key) === list[0].url) {
          return []; // la web repite la primera página: ya no hay más
        }
        return list;
      } catch (e) {
        if (page > 1 && (e.status === 404 || /\b404\b/.test(String(e.message || '')))) return [];
        lastErr = e;
      }
    }

    // Más allá de la última página: lista vacía, sin error
    if (page > 1) return [];
    // Primera página de un listado por filtros sin resultados: mostrar el motivo
    if (!q) {
      if (lastDiag) throw new Error(`Sin tarjetas · ${lastDiag}`);
      if (lastErr) throw new Error(`No se pudo cargar (${lastErr.message})`);
    }
    return [];
  },

  async details(url) {
    const absUrl = api.abs(url, BASE_URL);
    const htmlText = await api.text(absUrl);
    const doc = new DOMParser().parseFromString(htmlText, 'text/html');

    const title = pickText(doc, ['h1', '.entry-title', '.title', 'header h1', 'main h1']);
    // Portada: og:image o la primera imagen que no sea el logo del sitio
    const goodImg = (u) => !!u && !/^data:/i.test(u) && !/logo|logito|favicon|placeholder|\/web\.jpg/i.test(u);
    const imgCandidates = [pickAttr(doc, ['meta[property="og:image"]'], 'content')].concat(
      Array.from(doc.querySelectorAll('.poster img, .cover img, article img, main img, img')).map(
        (el) => el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('src') || ''
      )
    );
    const coverRaw = imgCandidates.find(goodImg) || '';
    const cover = coverRaw ? api.abs(coverRaw, absUrl) : '';

    const bannerRaw = pickAttr(
      doc,
      ['.banner img', '.backdrop img', '.bg img'],
      'src'
    );
    const banner = bannerRaw ? api.abs(bannerRaw, absUrl) : undefined;

    const description = pickText(doc, [
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

    doc.querySelectorAll('iframe').forEach((iframe, idx) => {
      const src =
        iframe.getAttribute('src') ||
        iframe.getAttribute('data-src') ||
        iframe.getAttribute('data-lazy-src') ||
        '';
      const label =
        iframe.getAttribute('data-server') ||
        iframe.getAttribute('data-label') ||
        iframe.getAttribute('title') ||
        `Iframe ${idx + 1}`;
      add(src, label, 'embed');
    });

    doc.querySelectorAll('video, video source').forEach((el, idx) => {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      const label = el.getAttribute('label') || `Video ${idx + 1}`;
      add(src, label);
    });

    const dataAttrs = [
      'data-src',
      'data-url',
      'data-embed',
      'data-player',
      'data-link',
      'data-video',
      'data-file',
      'data-iframe'
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

    const unescaped = html
      .replace(/\\\//g, '/')
      .replace(/\\u0026/g, '&')
      .replace(/&amp;/g, '&');

    const mediaRegex =
      /https?:\/\/[^\s"'<>`\\)]+(?:\.m3u8|\.mp4|\/embed\/|\/e\/|\/player\/|\/v\/|\/watch\?|mega\.nz\/|drive\.google\.com\/|mediafire\.com\/|1fichier\.com\/)[^\s"'<>`\\)]*/gi;
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
