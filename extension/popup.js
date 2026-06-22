let roster = {};
let settings = { prioritizeOwned: false };
let defaultAddStatus = "owned";
let activeFilter = "all";
let currentFocus = -1;

const searchInput = document.getElementById("searchInput");
const autocompleteList = document.getElementById("autocompleteList");
const prioritizeOwnedCheckbox = document.getElementById("prioritizeOwned");
const rosterList = document.getElementById("rosterList");
const emptyState = document.getElementById("emptyState");
const ownedCountEl = document.getElementById("ownedCount");
const rentedCountEl = document.getElementById("rentedCount");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const importText = document.getElementById("importText");

chrome.storage.sync.get(["roster", "settings"], (result) => {
  if (result.roster) roster = result.roster;
  if (result.settings) {
    settings = result.settings;
    prioritizeOwnedCheckbox.checked = !!settings.prioritizeOwned;
  }
  renderRoster();
});

prioritizeOwnedCheckbox.addEventListener("change", (e) => {
  settings.prioritizeOwned = e.target.checked;
  saveData();
});

document.querySelectorAll(".segment").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    defaultAddStatus = btn.dataset.status;
  });
});

document.querySelectorAll(".filter-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    activeFilter = btn.dataset.filter;
    renderRoster();
  });
});

exportBtn.addEventListener("click", exportBackup);
importBtn.addEventListener("click", () => importBackup(importText.value));
importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  importBackup(text);
  importFile.value = "";
});

function saveData() {
  chrome.storage.sync.set({ roster, settings });
}

function formatName(slug) {
  return RosterUtils.formatPokemonName(slug);
}

function updateStats() {
  const owned = Object.values(roster).filter((s) => s === "owned").length;
  const rented = Object.values(roster).filter((s) => s === "rented").length;
  ownedCountEl.textContent = String(owned);
  rentedCountEl.textContent = String(rented);
}

function exportBackup() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    roster,
    settings,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pokebox-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importBackup(raw) {
  if (!raw?.trim()) {
    alert("Paste or choose a backup file first.");
    return;
  }

  try {
    const data = JSON.parse(raw);
    const importedRoster = data.roster || data;
    if (!importedRoster || typeof importedRoster !== "object" || Array.isArray(importedRoster)) {
      throw new Error("Invalid roster format");
    }

    const cleaned = {};
    for (const [name, status] of Object.entries(importedRoster)) {
      const slug = RosterUtils.normalizeSlug(name);
      if (!slug) continue;
      cleaned[slug] = status === "rented" ? "rented" : "owned";
    }

    roster = cleaned;
    if (data.settings && typeof data.settings === "object") {
      settings = {
        prioritizeOwned: !!data.settings.prioritizeOwned,
      };
      prioritizeOwnedCheckbox.checked = settings.prioritizeOwned;
    }

    saveData();
    renderRoster();
    importText.value = "";
    alert(`Imported ${Object.keys(cleaned).length} Pokémon.`);
  } catch (err) {
    alert("Could not import backup. Make sure the JSON is from this extension.");
  }
}

searchInput.addEventListener("input", function () {
  const val = this.value.toLowerCase().trim();
  closeAllLists();
  if (!val) return;

  currentFocus = -1;
  const matches = POKEMON_LIST.filter((slug) => {
    const label = formatName(slug).toLowerCase();
    return slug.includes(val) || label.includes(val);
  }).slice(0, 12);

  matches.forEach((slug) => {
    const li = document.createElement("li");
    const label = formatName(slug);
    const regex = new RegExp(`(${val.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    li.innerHTML = `${label.replace(regex, "<strong>$1</strong>")}<input type="hidden" value="${slug}">`;
    li.addEventListener("click", () => {
      addPokemon(li.querySelector("input").value);
      closeAllLists();
    });
    autocompleteList.appendChild(li);
  });
});

searchInput.addEventListener("keydown", (e) => {
  const items = autocompleteList.getElementsByTagName("li");
  if (e.key === "ArrowDown") {
    e.preventDefault();
    currentFocus += 1;
    addActive(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    currentFocus -= 1;
    addActive(items);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (currentFocus > -1 && items[currentFocus]) {
      items[currentFocus].click();
    } else if (items.length > 0) {
      items[0].click();
    }
  } else if (e.key === "Escape") {
    closeAllLists();
  }
});

function addActive(items) {
  if (!items.length) return;
  removeActive(items);
  if (currentFocus >= items.length) currentFocus = 0;
  if (currentFocus < 0) currentFocus = items.length - 1;
  items[currentFocus].classList.add("autocomplete-active");
  items[currentFocus].scrollIntoView({ block: "nearest" });
}

function removeActive(items) {
  Array.from(items).forEach((item) => item.classList.remove("autocomplete-active"));
}

function closeAllLists() {
  autocompleteList.innerHTML = "";
}

document.addEventListener("click", (e) => {
  if (e.target !== searchInput) closeAllLists();
});

function addPokemon(slug) {
  const key = RosterUtils.normalizeSlug(slug);
  if (!key) return;
  roster[key] = defaultAddStatus;
  saveData();
  renderRoster();
  searchInput.value = "";
  searchInput.focus();
}

function removePokemon(name) {
  delete roster[name];
  saveData();
  renderRoster();
}

function toggleStatus(name) {
  roster[name] = roster[name] === "owned" ? "rented" : "owned";
  saveData();
  renderRoster();
}

function renderRoster() {
  rosterList.innerHTML = "";
  updateStats();

  const names = Object.keys(roster)
    .filter((name) => activeFilter === "all" || roster[name] === activeFilter)
    .sort((a, b) => formatName(a).localeCompare(formatName(b)));

  if (names.length === 0) {
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  names.forEach((name) => {
    const status = roster[name];
    const li = document.createElement("li");

    const nameWrap = document.createElement("div");
    nameWrap.className = "pokemon-name";
    nameWrap.innerHTML = `${formatName(name)}<span class="pokemon-slug">${name}</span>`;

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "actions";

    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = `btn ${status}`;
    toggleBtn.textContent = status === "owned" ? "Owned" : "Rented";
    toggleBtn.onclick = () => toggleStatus(name);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn remove";
    removeBtn.title = "Remove";
    removeBtn.textContent = "×";
    removeBtn.onclick = () => removePokemon(name);

    actionsDiv.appendChild(toggleBtn);
    actionsDiv.appendChild(removeBtn);
    li.appendChild(nameWrap);
    li.appendChild(actionsDiv);
    rosterList.appendChild(li);
  });
}

searchInput.focus();
