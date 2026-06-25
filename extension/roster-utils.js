// Shared roster matching utilities (popup + content script)

const ROSTER_ALIASES = {
  dragonair: ["dragonair", "dragonite"],
  dragonite: ["dragonair", "dragonite"],
  basculegion: ["basculegion", "basculegion-male", "basculegion-female"],
  "basculegion-male": ["basculegion", "basculegion-male", "basculegion-female"],
  "basculegion-female": ["basculegion", "basculegion-male", "basculegion-female"],
};

function normalizeSlug(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/^mega\s+/, "")
    .replace(/\s+/g, "-");
}

function aliasKeys(slug) {
  const key = normalizeSlug(slug);
  const keys = new Set([key]);
  const aliases = ROSTER_ALIASES[key];
  if (aliases) aliases.forEach((a) => keys.add(a));
  if (key.includes("basculegion")) {
    keys.add("basculegion");
    keys.add("basculegion-male");
    keys.add("basculegion-female");
  }
  return keys;
}

function displayNameToSlug(name) {
  if (!name) return "";
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();

  const formMatch = lower.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (formMatch) {
    const base = formMatch[1].trim().replace(/\s+/g, "-");
    const form = formMatch[2].trim().toLowerCase();

    if (form === "hisuian") return `${base}-hisuian`;
    if (form === "male") return `${base}-male`;
    if (form === "female") return `${base}-female`;
    if (form === "wash") return "rotom-wash";
    if (form === "heat") return "rotom-heat";
    if (form === "fan") return "rotom-fan";
    if (form === "mow") return "rotom-mow";
    if (form === "frost") return "rotom-frost";
    if (form === "eternal") return "floette-eternal";
    return `${base}-${form.replace(/\s+/g, "-")}`;
  }

  return normalizeSlug(trimmed);
}

function formatPokemonName(slug) {
  return slug
    .split("-")
    .map((part) => {
      if (part === "hisuian") return "(Hisuian)";
      if (part === "male" || part === "female") return `(${part[0].toUpperCase()}${part.slice(1)})`;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ")
    .replace(" (Hisuian)", " (Hisuian)")
    .replace(/\s+/g, " ")
    .trim();
}

function buildRosterIndex(roster) {
  const index = { owned: new Set(), rented: new Set() };
  for (const [name, status] of Object.entries(roster || {})) {
    const bucket = status === "rented" ? index.rented : index.owned;
    aliasKeys(name).forEach((k) => bucket.add(k));
  }
  return index;
}

function rosterStatusForSlug(slug, rosterIndex) {
  const keys = aliasKeys(slug);
  for (const k of keys) {
    if (rosterIndex.owned.has(k)) return "owned";
    if (rosterIndex.rented.has(k)) return "rented";
  }
  return null;
}

function extractSlugFromImg(img) {
  if (!img) return null;
  const src = img.getAttribute("src") || "";
  const encoded = src.match(/sprites%2Froster%2F([a-zA-Z0-9-]+)\.png/i);
  if (encoded) return encoded[1].toLowerCase();
  const plain = src.match(/sprites\/roster\/([a-zA-Z0-9-]+)\.png/i);
  if (plain) return plain[1].toLowerCase();
  return null;
}

function extractSlugFromMonLink(link) {
  if (!link) return null;
  const href = link.getAttribute("href") || "";
  const match = href.match(/\/pokemon\/([a-zA-Z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function getTeamMonsFromCard(card) {
  const slugs = [];
  const seen = new Set();

  card.querySelectorAll("a.tc-mon, a.td-mon, .tc-mons img, .td-mon-grid img, .td-similar-mons img").forEach((el) => {
    let slug = null;
    if (el.tagName === "A") slug = extractSlugFromMonLink(el) || extractSlugFromImg(el.querySelector("img"));
    else slug = extractSlugFromImg(el);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  });

  if (slugs.length === 0) {
    card.querySelectorAll("img").forEach((img) => {
      const slug = extractSlugFromImg(img);
      if (slug && !seen.has(slug)) {
        seen.add(slug);
        slugs.push(slug);
      }
    });
  }

  return slugs;
}

function scoreTeamMons(mons, roster, settings) {
  const rosterIndex = buildRosterIndex(roster);
  let ownedCount = 0;
  let rentedCount = 0;

  mons.forEach((slug) => {
    const status = rosterStatusForSlug(slug, rosterIndex);
    if (status === "owned") ownedCount += 1;
    else if (status === "rented") rentedCount += 1;
  });

  const matched = ownedCount + rentedCount;
  const total = mons.length || 6;
  let sortScore = 0;

  // Match count is always primary; owned/rented only break ties within the same match tier.
  if (settings?.prioritizeOwned) {
    sortScore = matched * 10000 + ownedCount * 100 + rentedCount;
  } else {
    sortScore = matched * 1000 + ownedCount * 10 + rentedCount;
  }

  return { ownedCount, rentedCount, matched, total, sortScore };
}

const RosterUtilsExport = {
  ROSTER_ALIASES,
  normalizeSlug,
  aliasKeys,
  displayNameToSlug,
  formatPokemonName,
  buildRosterIndex,
  rosterStatusForSlug,
  extractSlugFromImg,
  extractSlugFromMonLink,
  getTeamMonsFromCard,
  scoreTeamMons,
};

if (typeof globalThis !== "undefined") {
  globalThis.RosterUtils = RosterUtilsExport;
}
