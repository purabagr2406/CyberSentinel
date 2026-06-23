import { configureStore } from "@reduxjs/toolkit";
import frameAnalysisReducer from "../features/frameAnalysisSlice";

const store = configureStore({
	reducer: {
		frameAnalysis: frameAnalysisReducer,
	},
});

export default store;
