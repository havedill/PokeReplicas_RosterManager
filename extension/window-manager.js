const trackedWindows = {
  main: null,
  recommend: null,
  backup: null,
};

function clearTrackedWindow(windowId) {
  for (const key of Object.keys(trackedWindows)) {
    if (trackedWindows[key] === windowId) trackedWindows[key] = null;
  }
}

function openTrackedWindow(page, key, width, height) {
  const url = chrome.runtime.getURL(page);

  if (trackedWindows[key]) {
    chrome.windows.update(trackedWindows[key], { focused: true, width, height });
    return;
  }

  chrome.windows.create(
    {
      url,
      type: "popup",
      width,
      height,
      focused: true,
    },
    (win) => {
      if (win?.id) trackedWindows[key] = win.id;
    }
  );
}

function openMainWindow() {
  openTrackedWindow("popup.html", "main", 440, 920);
}

function openRecommendWindow() {
  openTrackedWindow("recommend.html", "recommend", 480, 640);
}

function openBackupWindow() {
  openTrackedWindow("backup.html", "backup", 420, 520);
}

const WindowManager = {
  trackedWindows,
  clearTrackedWindow,
  openMainWindow,
  openRecommendWindow,
  openBackupWindow,
};

if (typeof globalThis !== "undefined") {
  globalThis.WindowManager = WindowManager;
}
