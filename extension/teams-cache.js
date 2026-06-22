const SITE_BASE = "https://pokemonchampionsreplicateams.com";
const SITEMAP_URL = `${SITE_BASE}/sitemap.xml`;
const CACHE_KEY = "teamsCache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_CONCURRENCY = 10;
const USER_AGENT = "PokeReplicasExtension/1.1";

let refreshPromise = null;

function isStale(fetchedAt) {
  if (!fetchedAt) return true;
  const age = Date.now() - new Date(fetchedAt).getTime();
  return age > CACHE_TTL_MS;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseTeamMons(html) {
  for (const pattern of [
    /class="tc-mons"[^>]*>([\s\S]*?)<\/div>/,
    /class="td-mon-grid"[^>]*>([\s\S]*?)<\/div>/,
  ]) {
    const match = html.match(pattern);
    if (!match) continue;
    const mons = [];
    const slugRe = /href="\/pokemon\/([a-z0-9-]+)"/gi;
    let m;
    while ((m = slugRe.exec(match[1])) !== null) {
      if (!mons.includes(m[1])) mons.push(m[1]);
    }
    if (mons.length >= 2) return mons.slice(0, 6);
  }

  const blocks = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  for (const block of blocks) {
    if (!block.includes('"about"')) continue;
    try {
      const json = block.replace(/<script[^>]*>|<\/script>/g, "");
      const data = JSON.parse(json);
      if (Array.isArray(data.about) && data.about.length) {
        return data.about.map((name) => RosterUtils.displayNameToSlug(name)).filter(Boolean).slice(0, 6);
      }
    } catch {
      // skip bad JSON-LD
    }
  }

  return null;
}

async function getTeamUrls() {
  const xml = await fetchText(SITEMAP_URL);
  const urls = [];
  const re = /<loc>([^<]*\/teams\/[^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    urls.push(m[1]);
  }
  return urls;
}

async function fetchAllTeams(onProgress) {
  const urls = await getTeamUrls();
  const teams = [];
  let done = 0;

  async function worker(batch) {
    for (const url of batch) {
      try {
        const html = await fetchText(url);
        const mons = parseTeamMons(html);
        if (mons) teams.push(mons);
      } catch {
        // skip failed pages
      }
      done += 1;
      if (onProgress) onProgress(done, urls.length);
    }
  }

  const batchSize = Math.ceil(urls.length / FETCH_CONCURRENCY);
  const batches = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    batches.push(urls.slice(i, i + batchSize));
  }

  await Promise.all(batches.map((batch) => worker(batch)));

  return {
    fetchedAt: new Date().toISOString(),
    count: teams.length,
    teams,
  };
}

async function getCachedTeams() {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return result[CACHE_KEY] || null;
}

async function setCachedTeams(cache) {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

async function loadBundledTeams() {
  const url = chrome.runtime.getURL("teams-index.json");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to load bundled teams index");
  return res.json();
}

async function ensureTeamsCache() {
  let cache = await getCachedTeams();

  if (!cache?.teams?.length) {
    try {
      cache = await loadBundledTeams();
      await setCachedTeams(cache);
    } catch {
      cache = { fetchedAt: null, count: 0, teams: [] };
    }
  }

  if (isStale(cache.fetchedAt)) {
    refreshTeamsCache().catch(() => {
      // keep serving stale cache on failure
    });
  }

  return cache;
}

async function refreshTeamsCache() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const cache = await fetchAllTeams();
      if (cache.teams.length > 0) {
        await setCachedTeams(cache);
        return cache;
      }
      throw new Error("No teams fetched");
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

const TeamsCache = {
  CACHE_KEY,
  CACHE_TTL_MS,
  isStale,
  getCachedTeams,
  setCachedTeams,
  loadBundledTeams,
  ensureTeamsCache,
  refreshTeamsCache,
};

if (typeof globalThis !== "undefined") {
  globalThis.TeamsCache = TeamsCache;
}
