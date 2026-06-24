import { createSlice } from "@reduxjs/toolkit";
import { DEFAULT_SETTINGS, normalizeSettings } from "./settingsApi";

const initialState = {
	values: DEFAULT_SETTINGS,
	isLoaded: false,
	isSaving: false,
	lastSavedAt: null,
};

const settingsSlice = createSlice({
	name: "settings",
	initialState,
	reducers: {
		settingsLoaded(state, action) {
			state.values = normalizeSettings(action.payload);
			state.isLoaded = true;
		},
		settingsChanged(state, action) {
			state.values = normalizeSettings({
				...state.values,
				...action.payload,
			});
		},
		settingsSaveStarted(state) {
			state.isSaving = true;
		},
		settingsSaved(state, action) {
			state.values = normalizeSettings(action.payload);
			state.isSaving = false;
			state.isLoaded = true;
			state.lastSavedAt = new Date().toISOString();
		},
		settingsReset(state) {
			state.values = DEFAULT_SETTINGS;
		},
	},
});

export const {
	settingsChanged,
	settingsLoaded,
	settingsReset,
	settingsSaved,
	settingsSaveStarted,
} = settingsSlice.actions;

export const selectSettings = (state) => state.settings.values;
export const selectSettingsSaving = (state) => state.settings.isSaving;
export const selectSettingsLastSavedAt = (state) => state.settings.lastSavedAt;

export default settingsSlice.reducer;
