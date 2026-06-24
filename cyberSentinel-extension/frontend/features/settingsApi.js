export const SETTINGS_STORAGE_KEY = "cyberSentinelSettings";

export const DEFAULT_SETTINGS = {
	participantLimit: 6,
	framesPerBatch: 3,
	captureIntervalMs: 1000,
	maxQueueSize: 5,
	startUpMode: "auto",
};

function hasChromeStorage() {
	return Boolean(globalThis.chrome?.storage?.local);
}

export function normalizeSettings(settings) {
	const nextSettings = {
		...DEFAULT_SETTINGS,
		...(settings || {}),
	};

	return {
		participantLimit: clampInteger(nextSettings.participantLimit, 1, 12),
		framesPerBatch: clampInteger(nextSettings.framesPerBatch, 1, 6),
		captureIntervalMs: clampInteger(nextSettings.captureIntervalMs, 500, 10000),
		maxQueueSize: clampInteger(nextSettings.maxQueueSize, 1, 20),
		startUpMode: ["auto", "manual"].includes(nextSettings.startupMode) 
      ? nextSettings.startupMode 
      : "auto",
	};
}

export function getSettings() {
	if (!hasChromeStorage()) {
		return Promise.resolve(DEFAULT_SETTINGS);
	}

	return new Promise((resolve) => {
		globalThis.chrome.storage.local.get(SETTINGS_STORAGE_KEY, (items) => {
			resolve(normalizeSettings(items[SETTINGS_STORAGE_KEY]));
		});
	});
}

export function saveSettings(settings) {
	const normalizedSettings = normalizeSettings(settings);

	if (!hasChromeStorage()) {
		return Promise.resolve(normalizedSettings);
	}

	return new Promise((resolve) => {
		globalThis.chrome.storage.local.set(
			{
				[SETTINGS_STORAGE_KEY]: normalizedSettings,
			},
			() => resolve(normalizedSettings),
		);
	});
}

export function subscribeToSettings(onChange) {
	if (!hasChromeStorage()) {
		return () => {};
	}

	const listener = (changes, areaName) => {
		if (areaName !== "local" || !changes[SETTINGS_STORAGE_KEY]) {
			return;
		}

		onChange(normalizeSettings(changes[SETTINGS_STORAGE_KEY].newValue));
	};

	globalThis.chrome.storage.onChanged.addListener(listener);

	return () => {
		// return value for unsubscribe
		// to save memory
		globalThis.chrome.storage.onChanged.removeListener(listener);
	};
}

function clampInteger(value, min, max) {
	const numberValue = Number.parseInt(value, 10);

	if (Number.isNaN(numberValue)) {
		return min;
	}

	return Math.min(Math.max(numberValue, min), max);
}
