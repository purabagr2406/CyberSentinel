export const FRAME_ANALYSIS_STORAGE_KEY = "cyberSentinelLatestAnalysis";

export const DEFAULT_ANALYSIS_STATE = {
  status: "idle",
  summary: "",
  results: [],
  message: "Open a Teams call to begin scanning.",
  updatedAt: null,
  timestamp: null,
  queueSize: 0,
  framesSent: 0,
};

function hasChromeStorage() {
  return Boolean(globalThis.chrome?.storage?.local);
}

export function getLatestAnalysis() {
  if (!hasChromeStorage()) {
    return Promise.resolve(DEFAULT_ANALYSIS_STATE);
  }

  return new Promise((resolve) => {
    globalThis.chrome.storage.local.get(FRAME_ANALYSIS_STORAGE_KEY, (items) => {
      resolve(items[FRAME_ANALYSIS_STORAGE_KEY] || DEFAULT_ANALYSIS_STATE);
    });
  });
}

export function subscribeToAnalysis(onChange) {
  if (!hasChromeStorage()) {
    return () => {};
  }

  const listener = (changes, areaName) => {
    if (areaName !== "local" || !changes[FRAME_ANALYSIS_STORAGE_KEY]) {
      return;
    }

    onChange(changes[FRAME_ANALYSIS_STORAGE_KEY].newValue || DEFAULT_ANALYSIS_STATE);
  };

  globalThis.chrome.storage.onChanged.addListener(listener);

  return () => {
    globalThis.chrome.storage.onChanged.removeListener(listener);
  };
}

export function clearLatestAnalysis() {
  if (!hasChromeStorage()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    globalThis.chrome.storage.local.set(
      {
        [FRAME_ANALYSIS_STORAGE_KEY]: {
          ...DEFAULT_ANALYSIS_STATE,
          message: "No scan result is currently stored.",
          updatedAt: new Date().toISOString(),
        },
      },
      resolve,
    );
  });
}
