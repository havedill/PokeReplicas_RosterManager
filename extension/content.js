let roster = {};
let settings = { prioritizeOwned: false };
let isRosterSortActive = false;
let isApplying = false;

const GRID_SELECTORS = ".team-grid, .td-similar-grid";
const CARD_SELECTOR = "article.tc, a.td-similar-card";

chrome.storage.sync.get(["roster", "settings", "rosterSortActive"], (result) => {
  if (result.roster) roster = result.roster;
  if (result.settings) settings = result.settings;
  if (typeof result.rosterSortActive === "boolean") isRosterSortActive = result.rosterSortActive;
  init();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "sync") return;
  if (changes.roster) roster = changes.roster.newValue || {};
  if (changes.settings) settings = changes.settings.newValue || settings;
  if (changes.rosterSortActive) isRosterSortActive = changes.rosterSortActive.newValue;
  applyAll();
});

function init() {
  injectControls();
  applyAll();

  const observer = new MutationObserver(() => {
    if (isApplying) return;
    clearTimeout(window.__extProcessTimer);
    window.__extProcessTimer = setTimeout(() => {
      injectControls();
      applyAll();
    }, 150);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function injectControls() {
  const fbControls = document.querySelector(".fb-controls");
  if (!fbControls || fbControls.querySelector(".ext-injected")) return;

  const extContainer = document.createElement("div");
  extContainer.className = "fb-field ext-injected";

  const sortLabel = document.createElement("label");
  sortLabel.className = "ext-sort-label";

  const sortCheckbox = document.createElement("input");
  sortCheckbox.type = "checkbox";
  sortCheckbox.checked = isRosterSortActive;
  sortCheckbox.addEventListener("change", (e) => {
    isRosterSortActive = e.target.checked;
    chrome.storage.sync.set({ rosterSortActive: isRosterSortActive });
    applyAll();
  });

  sortLabel.appendChild(sortCheckbox);
  sortLabel.appendChild(document.createTextNode("Sort by Roster Match"));

  extContainer.appendChild(sortLabel);
  fbControls.appendChild(extContainer);
}

function getCards() {
  return Array.from(document.querySelectorAll(CARD_SELECTOR)).filter((card) => {
    return RosterUtils.getTeamMonsFromCard(card).length >= 2;
  });
}

function decorateCard(card) {
  const mons = RosterUtils.getTeamMonsFromCard(card);
  const stats = RosterUtils.scoreTeamMons(mons, roster, settings);
  card.dataset.extScore = String(stats.sortScore);

  mons.forEach((slug) => {
    const status = RosterUtils.rosterStatusForSlug(slug, RosterUtils.buildRosterIndex(roster));
    const imgs = Array.from(card.querySelectorAll("img")).filter((img) => {
      const imgSlug = RosterUtils.extractSlugFromImg(img);
      return imgSlug === slug;
    });

    imgs.forEach((img) => {
      img.classList.remove("ext-owned", "ext-rented", "ext-missing");
      if (status === "owned") img.classList.add("ext-owned");
      else if (status === "rented") img.classList.add("ext-rented");
      else img.classList.add("ext-missing");
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
  if (!isRosterSortActive) return;

  document.querySelectorAll(GRID_SELECTORS).forEach((grid) => {
    const cards = Array.from(grid.querySelectorAll(":scope > article.tc, :scope > a.td-similar-card"));
    if (cards.length < 2) return;

    cards.sort((a, b) => {
      const scoreA = Number(a.dataset.extScore || 0);
      const scoreB = Number(b.dataset.extScore || 0);
      return scoreB - scoreA;
    });

    cards.forEach((card) => grid.appendChild(card));
  });
}

function applyAll() {
  isApplying = true;
  try {
    getCards().forEach(decorateCard);
    sortGrids();
  } finally {
    requestAnimationFrame(() => {
      isApplying = false;
    });
  }
}
