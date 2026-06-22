// Recommendation engine: which Pokémon to add next for max team coverage

function teamHasMon(mons, slug) {
  const keys = RosterUtils.aliasKeys(slug);
  return mons.some((m) => {
    const mk = RosterUtils.aliasKeys(m);
    for (const k of keys) {
      if (mk.has(k)) return true;
    }
    return false;
  });
}

function isInRoster(slug, rosterIndex) {
  return RosterUtils.rosterStatusForSlug(slug, rosterIndex) !== null;
}

function getRecommendations(teams, roster, settings, limit = 8) {
  if (!teams?.length) return [];

  const rosterIndex = RosterUtils.buildRosterIndex(roster);
  const candidates = new Set();

  teams.forEach((mons) => {
    mons.forEach((slug) => {
      if (!isInRoster(slug, rosterIndex)) {
        candidates.add(slug);
      }
    });
  });

  const scored = [];

  for (const candidate of candidates) {
    let unlockFull = 0;
    let improve = 0;
    let teamsWith = 0;

    for (const mons of teams) {
      if (!teamHasMon(mons, candidate)) continue;

      teamsWith += 1;
      const before = RosterUtils.scoreTeamMons(mons, roster, settings);
      const afterMatched = before.matched + 1;

      if (afterMatched > before.matched) improve += 1;
      if (afterMatched >= mons.length) unlockFull += 1;
    }

    if (teamsWith === 0) continue;

    const score = unlockFull * 10000 + improve * 100 + teamsWith;

    scored.push({
      slug: candidate,
      unlockFull,
      improve,
      teamsWith,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
  return scored.slice(0, limit);
}

const RecommendEngine = { getRecommendations, teamHasMon, isInRoster };

if (typeof globalThis !== "undefined") {
  globalThis.RecommendEngine = RecommendEngine;
}
