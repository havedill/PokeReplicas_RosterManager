let roster = {};
let settings = { prioritizeOwned: false };
let teamsCache = null;

const recommendList = document.getElementById("recommendList");
const recommendEmpty = document.getElementById("recommendEmpty");
const cacheMeta = document.getElementById("cacheMeta");

function formatName(slug) {
  return RosterUtils.formatPokemonName(slug);
}

function formatCacheAge(fetchedAt) {
  if (!fetchedAt) return "team data unavailable";
  const days = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "updated today";
  if (days === 1) return "updated yesterday";
  return `updated ${days}d ago`;
}

function addPokemon(slug, status) {
  const key = RosterUtils.normalizeSlug(slug);
  if (!key) return;
  roster[key] = status;
  chrome.storage.sync.set({ roster, settings }, renderRecommendations);
}

function loadData() {
  chrome.storage.sync.get(["roster", "settings"], (result) => {
    roster = result.roster || {};
    settings = result.settings || { prioritizeOwned: false };
    loadTeamsCache();
  });
}

function loadTeamsCache() {
  cacheMeta.textContent = "Loading teams…";

  chrome.runtime.sendMessage({ type: "GET_TEAMS_CACHE" }, (response) => {
    if (chrome.runtime.lastError || !response?.ok) {
      cacheMeta.textContent = "Could not load team data";
      recommendList.innerHTML = "";
      recommendEmpty.classList.remove("hidden");
      recommendEmpty.querySelector("p").textContent =
        "Team data is still loading. Try closing and reopening this window.";
      return;
    }

    teamsCache = response.cache;
    const stale =
      teamsCache?.fetchedAt &&
      Date.now() - new Date(teamsCache.fetchedAt).getTime() > 7 * 24 * 60 * 60 * 1000;

    cacheMeta.textContent = `${teamsCache?.count || teamsCache?.teams?.length || 0} teams · ${formatCacheAge(teamsCache?.fetchedAt)}${stale ? " · refreshing" : ""}`;
    renderRecommendations();
  });
}

function renderRecommendations() {
  recommendList.innerHTML = "";

  if (!teamsCache?.teams?.length) {
    recommendEmpty.classList.remove("hidden");
    return;
  }

  const recs = RecommendEngine.getRecommendations(teamsCache.teams, roster, settings, 12);

  if (recs.length === 0) {
    recommendEmpty.classList.remove("hidden");
    recommendEmpty.querySelector("p").textContent =
      Object.keys(roster).length === 0
        ? "Add Pokémon to your roster to get personalized recommendations."
        : "Your box already covers the top missing picks. Nice!";
    return;
  }

  recommendEmpty.classList.add("hidden");

  recs.forEach((rec) => {
    const li = document.createElement("li");

    const info = document.createElement("div");
    info.className = "recommend-info";
    info.innerHTML = `
      <div class="recommend-name">${formatName(rec.slug)}</div>
      <div class="recommend-stats">
        <strong>${rec.unlockFull}</strong> full teams ·
        <strong>${rec.improve}</strong> improved ·
        on <strong>${rec.teamsWith}</strong> teams
      </div>
    `;

    const actions = document.createElement("div");
    actions.className = "recommend-actions";

    const ownedBtn = document.createElement("button");
    ownedBtn.type = "button";
    ownedBtn.className = "btn owned";
    ownedBtn.textContent = "+ Owned";
    ownedBtn.onclick = () => addPokemon(rec.slug, "owned");

    const rentedBtn = document.createElement("button");
    rentedBtn.type = "button";
    rentedBtn.className = "btn rented";
    rentedBtn.textContent = "+ Rented";
    rentedBtn.onclick = () => addPokemon(rec.slug, "rented");

    actions.appendChild(ownedBtn);
    actions.appendChild(rentedBtn);
    li.appendChild(info);
    li.appendChild(actions);
    recommendList.appendChild(li);
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync") {
    if (changes.roster) roster = changes.roster.newValue || {};
    if (changes.settings) settings = changes.settings.newValue || settings;
    renderRecommendations();
  }
  if (area === "local" && changes.teamsCache) {
    teamsCache = changes.teamsCache.newValue;
    renderRecommendations();
  }
});

loadData();
