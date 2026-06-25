let roster = {};
let settings = { prioritizeOwned: false };
let isRosterSortActive = false;
let isApplying = false;
let isAutoLoading = false;
let cascadeGeneration = 0;
let autoLoadGeneration = 0;

const GRID_SELECTORS = ".team-grid, .td-similar-grid";
const CARD_SELECTOR = "article.tc, a.td-similar-card";
const RESORT_DELAYS_MS = [400, 900, 1800];
const MAX_LOAD_ALL_BATCHES = 32;
const DEBUG = () => window.__pokeboxDebug !== false;

function isExtensionAlive() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

function storageSet(values) {
  if (!isExtensionAlive()) {
    debugLog("storage unavailable — refresh the page after reloading the extension");
    return;
  }
  try {
    chrome.storage.sync.set(values);
  } catch {
    debugLog("storage unavailable — refresh the page after reloading the extension");
  }
}

function whenPageReady(fn) {
  setTimeout(fn, 800);
}

function debugLog(...args) {
  if (!DEBUG()) return;
  console.log("[Pokebox]", ...args);
}

function debugGroup(label, fn) {
  if (!DEBUG()) {
    fn();
    return;
  }
  console.groupCollapsed(`[Pokebox] ${label}`);
  try {
    fn();
  } finally {
    console.groupEnd();
  }
}

chrome.storage.sync.get(["roster", "settings", "rosterSortActive"], (result) => {
  if (!isExtensionAlive()) return;
  if (result.roster) roster = result.roster;
  if (result.settings) settings = result.settings;
  if (typeof result.rosterSortActive === "boolean") isRosterSortActive = result.rosterSortActive;
  init();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (!isExtensionAlive() || namespace !== "sync") return;
  if (changes.roster) roster = changes.roster.newValue || {};
  if (changes.settings) settings = changes.settings.newValue || settings;
  if (changes.rosterSortActive) isRosterSortActive = changes.rosterSortActive.newValue;
  applyAll("storage-change");
});

function init() {
  debugLog("debug on — window.__pokeboxDebug = false to silence");

  const observer = new MutationObserver(() => {
    if (isApplying || isAutoLoading) return;
    scheduleApply("body-mutation");
    watchGrids();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  whenPageReady(() => {
    injectControls();
    hookFilterControls();
    watchGrids();
    injectCodeGateNotes();
    applyAll("init", () => scheduleAutoLoad("init"));
  });

  window.__pokeboxLoadMore = () => {
    autoLoadGeneration += 1;
    whenApplyIdle(() => loadAllTeams("console", false));
  };
  window.__pokeboxDump = () => ({
    rosterSortActive: isRosterSortActive,
    teamsLoaded: getLoadedTeamCount(),
    pagination: getPaginationInfo(),
    hasFullMatch: gridHasFullMatch(mainGrid()),
    showMoreButton: !!findShowMoreButton(),
  });
}

function injectCodeGateNotes() {
  document.querySelectorAll(".code-box").forEach((box) => {
    if (!box.querySelector(".code-gate-mask") || box.querySelector(".ext-code-hint")) return;

    const hint = document.createElement("div");
    hint.className = "ext-code-hint";
    hint.setAttribute("role", "note");
    hint.innerHTML = `
      <strong>No app required</strong>
      <span>Get the Replica ID from the <em>screenshot above</em> or the <em>source link below</em> — then paste it into Pokémon Champions.</span>
    `;

    const gate = box.querySelector(".code-gate");
    if (gate) {
      gate.insertBefore(hint, gate.firstChild);
      return;
    }

    const label = box.querySelector(".code-box-label");
    if (label) {
      label.insertAdjacentElement("afterend", hint);
    }
  });
}

function hookFilterControls() {
  const fbControls = document.querySelector(".fb-controls");
  if (!fbControls || fbControls.dataset.extHooked) return;
  fbControls.dataset.extHooked = "1";

  fbControls.addEventListener(
    "change",
    (e) => {
      if (e.target.closest(".ext-injected")) return;
      if (e.target.tagName !== "SELECT") return;

      debugLog("site filter changed:", describeFilterTarget(e.target));
      cancelAutoLoad();
      if (!isRosterSortActive) return;
      scheduleApply("site-filter-change");
      scheduleApplyCascade("site-filter-change");
      scheduleAutoLoad("site-filter-change");
    },
    true,
  );
}

function watchGrids() {
  document.querySelectorAll(GRID_SELECTORS).forEach((grid) => {
    if (grid.dataset.extObserved) return;
    grid.dataset.extObserved = "1";

    new MutationObserver((mutations) => {
      if (!isRosterSortActive || isApplying || isAutoLoading) return;

      let addedCards = 0;
      mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.("article.tc, a.td-similar-card")) addedCards += 1;
          else addedCards += node.querySelectorAll?.("article.tc, a.td-similar-card").length || 0;
        });
      });

      if (addedCards >= 4) {
        scheduleApply("grid-bulk-load");
      }
    }).observe(grid, { childList: true });
  });
}

function scheduleApplyCascade(reason = "cascade") {
  const generation = ++cascadeGeneration;
  debugLog(`cascade (${reason}), gen=${generation}`);
  RESORT_DELAYS_MS.forEach((delay) => {
    setTimeout(() => {
      if (!isRosterSortActive || generation !== cascadeGeneration) return;
      applyAll(`${reason}@${delay}ms`);
      if (delay === RESORT_DELAYS_MS[RESORT_DELAYS_MS.length - 1]) {
        scheduleAutoLoad(reason);
      }
    }, delay);
  });
}

function cancelAutoLoad() {
  autoLoadGeneration += 1;
  isAutoLoading = false;
  setAutoLoadStatus("");
  updateLoadAllButton();
}

function scheduleAutoLoad(reason) {
  clearTimeout(window.__extAutoLoadTimer);
  window.__extAutoLoadTimer = setTimeout(() => {
    whenApplyIdle(() => maybeAutoLoadMore(reason));
  }, 300);
}

function clickShowMore(button) {
  button.click();
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
}

async function loadAllTeams(reason = "manual", stopOnFullMatch = false) {
  if (isAutoLoading) return false;

  const grid = mainGrid();
  if (!grid || !findShowMoreButton()) return false;

  const generation = ++autoLoadGeneration;
  isAutoLoading = true;
  debugLog(`load all teams (${reason})…`, getPaginationInfo());

  let batches = 0;
  while (
    batches < MAX_LOAD_ALL_BATCHES &&
    generation === autoLoadGeneration &&
    findShowMoreButton()
  ) {
    const beforeCount = getLoadedTeamCount();
    const pagination = getPaginationInfo();
    setAutoLoadStatus(`Loading… ${pagination.loaded ?? beforeCount} of ${pagination.total ?? "?"}`);
    updateLoadAllButton(true);

    clickShowMore(findShowMoreButton());
    batches += 1;

    const loaded = await waitForMoreCards(beforeCount, 10000);
    if (!loaded || generation !== autoLoadGeneration) break;

    applyAll(`load-all-${reason}-${batches}`);

    if (stopOnFullMatch && gridHasFullMatch(mainGrid())) {
      debugLog(`load all stopped early — 6/6 found at ${getLoadedTeamCount()} teams`);
      break;
    }
  }

  isAutoLoading = false;
  setAutoLoadStatus("");
  updateLoadAllButton();
  if (generation === autoLoadGeneration) {
    applyAll(`load-all-done-${reason}`);
    debugLog("load all finished", {
      teams: getLoadedTeamCount(),
      batches,
      pagination: getPaginationInfo(),
    });
  }

  return batches > 0;
}

function updateLoadAllButton(loading = false) {
  const btn = document.querySelector(".ext-load-all-btn");
  if (!btn) return;

  const pagination = getPaginationInfo();
  const onListPage = !!mainGrid();

  btn.hidden = !onListPage;
  if (!onListPage) return;

  if (!pagination.hasMore) {
    btn.disabled = true;
    btn.textContent =
      pagination.loaded && pagination.total ? `${pagination.loaded} loaded` : "All loaded";
    btn.title = "All matching teams are loaded";
    return;
  }

  btn.disabled = loading || isAutoLoading;
  const leftMatch = pagination.showMoreText?.match(/(\d+)\s+left/);
  const left = leftMatch ? leftMatch[1] : null;
  btn.textContent = loading
    ? `Loading… ${pagination.loaded ?? getLoadedTeamCount()}/${pagination.total ?? "?"}`
    : left
      ? `Load all (${left} left)`
      : "Load all";
  btn.title = pagination.countText
    ? `${pagination.countText} — load every team for Pokebox sort`
    : "Load all teams for Pokebox sort";
}

function injectControls() {
  const fbControls = document.querySelector(".fb-controls");
  if (!fbControls) return;

  if (!fbControls.querySelector(".ext-injected")) {
    const extContainer = document.createElement("div");
    extContainer.className = "fb-field ext-injected";

    const labelWrap = document.createElement("div");
    labelWrap.className = "ext-sort-copy";
    labelWrap.innerHTML = `
      <strong>Pokebox sort</strong>
      <span>Match your roster</span>
    `;

    const switchLabel = document.createElement("label");
    switchLabel.className = "ext-switch";
    switchLabel.title = "Sort by roster match";

    const sortCheckbox = document.createElement("input");
    sortCheckbox.type = "checkbox";
    sortCheckbox.checked = isRosterSortActive;
    sortCheckbox.addEventListener("change", (e) => {
      if (!isExtensionAlive()) {
        debugLog("extension was reloaded — refresh this tab to use Pokebox sort");
        e.target.checked = isRosterSortActive;
        return;
      }
      isRosterSortActive = e.target.checked;
      storageSet({ rosterSortActive: isRosterSortActive });
      cancelAutoLoad();
      applyAll("pokebox-sort-toggle");
      if (isRosterSortActive) {
        scheduleApplyCascade("pokebox-sort-toggle");
        scheduleAutoLoad("pokebox-sort-toggle");
      }
      updateLoadAllButton();
    });

    const slider = document.createElement("span");
    slider.className = "ext-switch-slider";

    switchLabel.appendChild(sortCheckbox);
    switchLabel.appendChild(slider);

    const loadAllBtn = document.createElement("button");
    loadAllBtn.type = "button";
    loadAllBtn.className = "ext-load-all-btn";
    loadAllBtn.addEventListener("click", () => {
      autoLoadGeneration += 1;
      whenApplyIdle(() => loadAllTeams("user-btn", false));
    });

    const statusEl = document.createElement("div");
    statusEl.className = "ext-load-status";
    statusEl.hidden = true;

    extContainer.appendChild(labelWrap);
    extContainer.appendChild(switchLabel);
    extContainer.appendChild(loadAllBtn);
    extContainer.appendChild(statusEl);
    fbControls.appendChild(extContainer);
  }

  updateLoadAllButton();
}

function setAutoLoadStatus(text) {
  const el = document.querySelector(".ext-load-status");
  if (!el) return;
  if (!text) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = text;
}

function scheduleApply(reason = "mutation") {
  if (reason === "body-mutation" && isAutoLoading) return;
  clearTimeout(window.__extProcessTimer);
  window.__extProcessTimer = setTimeout(() => {
    injectControls();
    hookFilterControls();
    watchGrids();
    injectCodeGateNotes();
    applyAll(reason);
  }, 150);
}

function describeFilterTarget(target) {
  if (!target) return "unknown";
  const label = target.closest("label.fb-field");
  const field = label?.childNodes[0]?.textContent?.trim().replace(/\s+/g, " ");
  const value = target.value ?? target.textContent;
  return field ? `${field} = ${value}` : String(value);
}

function getSiteFilters() {
  const fbControls = document.querySelector(".fb-controls");
  if (!fbControls) return {};
  const filters = {};
  fbControls.querySelectorAll("select").forEach((sel) => {
    const label = sel.closest("label.fb-field")?.childNodes[0]?.textContent?.trim() || "filter";
    filters[label] = sel.value;
  });
  return filters;
}

function getPaginationInfo() {
  const countEl = document.querySelector(".fb-count");
  const countText = countEl?.textContent?.trim().replace(/\s+/g, " ") || null;
  const showMoreBtn = findShowMoreButton();
  const showMoreText = showMoreBtn?.textContent?.trim().replace(/\s+/g, " ") || null;
  const match = countText?.match(/Showing\s+(\d+)\s+of\s+(\d+)/i);
  return {
    countText,
    showMoreText,
    loaded: match ? Number(match[1]) : null,
    total: match ? Number(match[2]) : null,
    hasMore: !!showMoreBtn,
  };
}

function findShowMoreButton() {
  return (
    document.querySelector(".tdir-more button") ||
    Array.from(document.querySelectorAll("button")).find((b) => /show more/i.test(b.textContent || ""))
  );
}

function getLoadedTeamCount() {
  const grid = mainGrid();
  return grid ? gridCardsInOrder(grid).length : 0;
}

function whenApplyIdle(fn) {
  const run = () => {
    if (isApplying) {
      requestAnimationFrame(run);
      return;
    }
    fn();
  };
  requestAnimationFrame(run);
}

function mainGrid() {
  return document.querySelector(".team-grid");
}

function cardTitle(card) {
  return (
    card.querySelector(".tc-title")?.textContent?.trim() ||
    card.getAttribute("aria-label")?.trim() ||
    card.querySelector("img")?.alt?.trim() ||
    "(untitled)"
  );
}

function cardMatchInfo(card) {
  const mons = RosterUtils.getTeamMonsFromCard(card);
  if (mons.length < 2) {
    return { title: cardTitle(card), mons: mons.length, matched: 0, total: mons.length, sortScore: -1, label: "?" };
  }
  const stats = RosterUtils.scoreTeamMons(mons, roster, settings);
  return {
    title: cardTitle(card),
    mons: mons.length,
    matched: stats.matched,
    total: stats.total,
    owned: stats.ownedCount,
    rented: stats.rentedCount,
    sortScore: stats.sortScore,
    label: `${stats.matched}/${stats.total}`,
  };
}

function summarizeGrid(grid) {
  const cards = gridCardsInOrder(grid);
  const infos = cards.map(cardMatchInfo);
  const byLabel = {};
  infos.forEach((info) => {
    byLabel[info.label] = (byLabel[info.label] || 0) + 1;
  });
  const ranked = [...infos].sort((a, b) => b.sortScore - a.sortScore);
  return { cards, infos, byLabel, ranked };
}

function gridHasFullMatch(grid) {
  const { ranked } = summarizeGrid(grid);
  return ranked.some((t) => t.matched >= 6 && t.total >= 6);
}

let lastLogKey = "";
let lastLogTime = 0;

function logSortReport(reason, gridResults) {
  if (!DEBUG() || !isRosterSortActive) return;
  if (reason === "body-mutation" || /@\d+ms$/.test(reason)) return;

  const pagination = getPaginationInfo();
  const siteFilters = getSiteFilters();
  const rosterSize = Object.keys(roster).length;
  const snapshot = gridResults
    .map((r) => `${r.cards.length}:${r.ranked[0]?.label || "?"}:${JSON.stringify(r.byLabel)}`)
    .join("|");
  const now = Date.now();
  if (snapshot === lastLogKey && now - lastLogTime < 3000) return;
  lastLogKey = snapshot;
  lastLogTime = now;

  debugGroup(`sort report — ${reason}`, () => {
    console.log("roster size:", rosterSize, "| prioritize owned:", !!settings.prioritizeOwned);
    console.log("site filters:", siteFilters);
    console.log("pagination:", pagination);

    gridResults.forEach(({ reordered, alreadySorted, ranked, byLabel, cards }) => {
      console.log("cards loaded:", cards.length);
      console.log("match breakdown:", byLabel);
      console.log(
        "top 5:",
        ranked.slice(0, 5).map((t, i) => `#${i + 1} ${t.label} — ${t.title}`),
      );

      const fullMatches = ranked.filter((t) => t.matched === t.total && t.total >= 6);
      if (fullMatches.length === 0 && pagination.hasMore) {
        console.warn(
          "No 6/6 in loaded teams.",
          pagination.countText + ".",
          "Pokebox will auto-load more while sort is on.",
        );
      } else if (fullMatches.length > 0) {
        const atTop = fullMatches[0] === ranked[0];
        console.log(
          "6/6 teams loaded:",
          fullMatches.length,
          "— best:",
          fullMatches[0].title,
          atTop ? "(at #1)" : `(at #${ranked.indexOf(fullMatches[0]) + 1})`,
        );
      }

      console.log("reordered:", reordered, "| already sorted:", alreadySorted);
    });

    if (
      isRosterSortActive &&
      !isAutoLoading &&
      pagination.hasMore &&
      !reason.startsWith("auto-load") &&
      !reason.startsWith("load-all") &&
      !reason.startsWith("after-")
    ) {
      const anyGrid = gridResults.some((r) => {
        const full = r.ranked.filter((t) => t.matched === t.total && t.total >= 6);
        return full.length === 0;
      });
      if (anyGrid) scheduleAutoLoad(`after-${reason}`);
    }
  });
}

function waitForMoreCards(beforeCount, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const count = getLoadedTeamCount();
      if (count > beforeCount) {
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        debugLog("auto-load wait timed out", { beforeCount, now: count });
        resolve(false);
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

async function maybeAutoLoadMore(reason) {
  if (!isRosterSortActive) {
    debugLog("auto-load skipped — roster sort off");
    return;
  }
  if (isAutoLoading) {
    debugLog("auto-load skipped — already loading");
    return;
  }
  if (isApplying) {
    whenApplyIdle(() => maybeAutoLoadMore(reason));
    return;
  }

  const grid = mainGrid();
  if (!grid || !findShowMoreButton()) {
    debugLog("auto-load skipped — missing grid or button");
    return;
  }
  if (gridHasFullMatch(grid)) {
    debugLog("auto-load skipped — 6/6 already loaded");
    return;
  }

  await loadAllTeams(`auto-${reason}`, true);
}

function getCards() {
  return Array.from(document.querySelectorAll(CARD_SELECTOR)).filter((card) => {
    return RosterUtils.getTeamMonsFromCard(card).length >= 2;
  });
}

function cardSortScore(card) {
  const mons = RosterUtils.getTeamMonsFromCard(card);
  if (mons.length < 2) return -1;
  return RosterUtils.scoreTeamMons(mons, roster, settings).sortScore;
}

function prepareCardForSort(card) {
  const mons = RosterUtils.getTeamMonsFromCard(card);
  if (mons.length >= 2) {
    decorateCard(card);
    return;
  }
  delete card.dataset.extScore;
  delete card.dataset.extOverlay;
}

function gridCardsInOrder(grid) {
  return Array.from(grid.querySelectorAll(":scope > article.tc, :scope > a.td-similar-card"));
}

function isGridSorted(grid, cards) {
  const live = gridCardsInOrder(grid);
  if (live.length !== cards.length) return false;
  for (let i = 0; i < cards.length; i += 1) {
    if (live[i] !== cards[i]) return false;
  }
  return true;
}

function decorateCard(card) {
  const mons = RosterUtils.getTeamMonsFromCard(card);
  const stats = RosterUtils.scoreTeamMons(mons, roster, settings);
  const overlayKey = `${stats.matched}/${stats.total}:${stats.ownedCount}:${stats.rentedCount}:${stats.sortScore}`;

  card.dataset.extScore = String(stats.sortScore);

  if (card.dataset.extOverlay === overlayKey) return;
  card.dataset.extOverlay = overlayKey;

  mons.forEach((slug) => {
    const status = RosterUtils.rosterStatusForSlug(slug, RosterUtils.buildRosterIndex(roster));
    const imgs = Array.from(card.querySelectorAll("img")).filter((img) => {
      const imgSlug = RosterUtils.extractSlugFromImg(img);
      return imgSlug === slug;
    });

    imgs.forEach((img) => {
      const nextClass =
        status === "owned" ? "ext-owned" : status === "rented" ? "ext-rented" : "ext-missing";
      if (!img.classList.contains(nextClass)) {
        img.classList.remove("ext-owned", "ext-rented", "ext-missing");
        img.classList.add(nextClass);
      }
    });
  });

  let overlayHost = card.querySelector(".tc-shot, .tc-body, .td-similar-mons") || card;
  if (getComputedStyle(overlayHost).position === "static") {
    overlayHost.style.position = "relative";
  }

  let overlay = card.querySelector(".ext-match-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "ext-match-overlay";
    overlayHost.appendChild(overlay);
  }

  const hasRoster = Object.keys(roster).length > 0;
  overlay.style.display = hasRoster ? "flex" : "none";
  overlay.innerHTML = `
    <span class="ext-match-main">${stats.matched}/${stats.total}</span>
    <span class="ext-match-sub">
      <em class="ext-owned-text">${stats.ownedCount} owned</em>
      <span class="ext-dot">·</span>
      <em class="ext-rented-text">${stats.rentedCount} rented</em>
    </span>
  `;

  card.classList.toggle("ext-has-match", stats.matched > 0);
  card.classList.toggle("ext-full-match", stats.matched === stats.total && stats.total > 0);
}

function sortGrids() {
  if (!isRosterSortActive) return [];

  const results = [];

  document.querySelectorAll(GRID_SELECTORS).forEach((grid) => {
    const cards = gridCardsInOrder(grid);
    if (cards.length < 2) return;

    cards.forEach(prepareCardForSort);

    const { ranked, byLabel } = summarizeGrid(grid);
    cards.sort((a, b) => cardSortScore(b) - cardSortScore(a));

    const alreadySorted = isGridSorted(grid, cards);
    let reordered = false;
    if (!alreadySorted) {
      cards.forEach((card) => grid.appendChild(card));
      reordered = true;
    }

    results.push({ grid, cards: gridCardsInOrder(grid), ranked, byLabel, reordered, alreadySorted });
  });

  return results;
}

function applyAll(reason = "manual", onIdle = null) {
  isApplying = true;
  try {
    getCards().forEach(decorateCard);
    const gridResults = sortGrids();
    logSortReport(reason, gridResults);
    updateLoadAllButton();
  } finally {
    requestAnimationFrame(() => {
      isApplying = false;
      if (onIdle) whenApplyIdle(onIdle);
    });
  }
}
