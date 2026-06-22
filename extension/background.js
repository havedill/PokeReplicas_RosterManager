importScripts("roster-utils.js", "teams-cache.js", "recommend.js", "window-manager.js");

const ALARM_NAME = "refreshTeamsCache";

chrome.action.onClicked.addListener(() => {
  WindowManager.openMainWindow();
});

chrome.windows.onRemoved.addListener((windowId) => {
  WindowManager.clearTrackedWindow(windowId);
});

chrome.runtime.onInstalled.addListener(async () => {
  const cache = await TeamsCache.getCachedTeams();
  if (!cache?.teams?.length) {
    try {
      const bundled = await TeamsCache.loadBundledTeams();
      await TeamsCache.setCachedTeams(bundled);
    } catch (err) {
      console.error("Failed to seed teams cache:", err);
    }
  }

  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 10080 }); // 7 days
  TeamsCache.ensureTeamsCache();
});

chrome.runtime.onStartup.addListener(() => {
  TeamsCache.ensureTeamsCache();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    TeamsCache.refreshTeamsCache().catch((err) => {
      console.error("Scheduled teams refresh failed:", err);
    });
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_TEAMS_CACHE") {
    TeamsCache.ensureTeamsCache()
      .then((cache) => sendResponse({ ok: true, cache }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  if (message?.type === "REFRESH_TEAMS_CACHE") {
    TeamsCache.refreshTeamsCache()
      .then((cache) => sendResponse({ ok: true, cache }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});
