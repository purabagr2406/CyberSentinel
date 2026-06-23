import { createSlice } from "@reduxjs/toolkit";
import { DEFAULT_ANALYSIS_STATE } from "./frameApi";

const initialState = {
	latest: DEFAULT_ANALYSIS_STATE,
	isLoaded: false,
};

const frameAnalysisSlice = createSlice({
	name: "frameAnalysis",
	initialState,
	reducers: {
		analysisReceived(state, action) {
			state.latest = action.payload || DEFAULT_ANALYSIS_STATE;
			state.isLoaded = true;
		},
		analysisCleared(state) {
			state.latest = {
				...DEFAULT_ANALYSIS_STATE,
				message: "No scan result is currently stored.",
				updatedAt: new Date().toISOString(),
			};
			state.isLoaded = true;
		},
	},
});

export const { analysisCleared, analysisReceived } = frameAnalysisSlice.actions;

export const selectLatestAnalysis = (state) => state.frameAnalysis.latest;
export const selectAnalysisLoaded = (state) => state.frameAnalysis.isLoaded;
export const selectAnalysisResults = (state) => {
	const results = state.frameAnalysis.latest.results;
	return Array.isArray(results) ? results : [];
};

export default frameAnalysisSlice.reducer;
