import { configureStore } from "@reduxjs/toolkit";
import frameAnalysisReducer from "../features/frameAnalysisSlice";
import settingsReducer from "../features/settingsSlice";

const store = configureStore({
	reducer: {
		frameAnalysis: frameAnalysisReducer,
		settings: settingsReducer,
	},
});

export default store;
