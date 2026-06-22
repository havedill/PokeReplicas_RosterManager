let roster = {};
let settings = { prioritizeOwned: false };

const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");
const importText = document.getElementById("importText");
const statusMsg = document.getElementById("statusMsg");

chrome.storage.sync.get(["roster", "settings"], (result) => {
  roster = result.roster || {};
  settings = result.settings || { prioritizeOwned: false };
});

function showStatus(text, isError = false) {
  statusMsg.textContent = text;
  statusMsg.classList.toggle("error", isError);
  statusMsg.classList.remove("hidden");
}

exportBtn.addEventListener("click", () => {
  chrome.storage.sync.get(["roster", "settings"], (result) => {
    roster = result.roster || {};
    settings = result.settings || { prioritizeOwned: false };

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
    showStatus(`Exported ${Object.keys(roster).length} Pokémon.`);
  });
});

importBtn.addEventListener("click", () => importBackup(importText.value));

importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  importBackup(await file.text());
  importFile.value = "";
});

function importBackup(raw) {
  if (!raw?.trim()) {
    showStatus("Paste or choose a backup file first.", true);
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
      settings = { prioritizeOwned: !!data.settings.prioritizeOwned };
    }

    chrome.storage.sync.set({ roster, settings }, () => {
      importText.value = "";
      showStatus(`Imported ${Object.keys(cleaned).length} Pokémon.`);
    });
  } catch {
    showStatus("Could not import backup. Make sure the JSON is from this extension.", true);
  }
}
