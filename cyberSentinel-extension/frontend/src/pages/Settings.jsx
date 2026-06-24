import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router";
import { getSettings, saveSettings } from "../../features/settingsApi";
import {
	selectSettings,
	selectSettingsSaving,
	settingsChanged,
	settingsLoaded,
	settingsSaveStarted,
	settingsSaved,
	settingsReset,
} from "../../features/settingsSlice";

const Settings = () => {
	const dispatch = useDispatch();
	const navigate = useNavigate();

	const settings = useSelector(selectSettings);
	const isSaving = useSelector(selectSettingsSaving);

	// Load settings when the component mounts
	useEffect(() => {
		let mounted = true;

		getSettings().then((currentSettings) => {
			if (mounted) {
				dispatch(settingsLoaded(currentSettings));
			}
		});

		return (() => {
			mounted = false;
		})
	}, [dispatch]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		dispatch(settingsChanged({ [name]: Number(value) }));
	};

	const handleSave = async () => {
		dispatch(settingsSaveStarted());
		const updatedSettings = await saveSettings(settings);
		dispatch(settingsSaved(updatedSettings));

		// Navigate back to the main view after saving
		navigate("/home");
	};

	const handleReset = () => {
		dispatch(settingsReset());
	};

	return (
		<div className="min-h-[460px] w-[360px] bg-slate-50 p-4.5 text-slate-900 flex flex-col">
			<header className="mb-6 flex items-center justify-between">
				<h1 className="text-[22px] leading-tight font-bold tracking-normal">Settings</h1>
				<button
					onClick={() => navigate('/home')}
					className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
					aria-label="Back to Home"
					title="Back"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<line x1="19" y1="12" x2="5" y2="12"></line>
						<polyline points="12 19 5 12 12 5"></polyline>
					</svg>
				</button>
			</header>

			<div className="flex-1 space-y-4">
				{/* Participant Limit */}
				{/* Add this inside the <div className="flex-1 space-y-4"> container */}

				<div className="rounded-lg border border-slate-200 bg-white p-3.5">
					<label className="flex items-center justify-between mb-2">
						<span className="text-sm font-bold">Startup Mode</span>
					</label>
					<select
						name="startupMode"
						value={settings.startupMode}
						onChange={handleChange}
						className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
					>
						<option value="auto">Automatic (Start immediately)</option>
						<option value="manual">Manual (Wait for me to start)</option>
					</select>
				</div>
				<div className="rounded-lg border border-slate-200 bg-white p-3.5">
					<label className="flex items-center justify-between mb-2">
						<span className="text-sm font-bold">Participant Limit</span>
						<span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{settings.participantLimit}</span>
					</label>
					<input
						type="range"
						name="participantLimit"
						min="1"
						max="12"
						value={settings.participantLimit}
						onChange={handleChange}
						className="w-full accent-slate-800"
					/>
				</div>

				{/* Frames Per Batch */}
				<div className="rounded-lg border border-slate-200 bg-white p-3.5">
					<label className="flex items-center justify-between mb-2">
						<span className="text-sm font-bold">Frames Per Batch</span>
						<span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{settings.framesPerBatch}</span>
					</label>
					<input
						type="range"
						name="framesPerBatch"
						min="1"
						max="6"
						value={settings.framesPerBatch}
						onChange={handleChange}
						className="w-full accent-slate-800"
					/>
				</div>

				{/* Capture Interval */}
				<div className="rounded-lg border border-slate-200 bg-white p-3.5">
					<label className="flex items-center justify-between mb-2">
						<span className="text-sm font-bold">Capture Interval (ms)</span>
						<span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{settings.captureIntervalMs}ms</span>
					</label>
					<input
						type="range"
						name="captureIntervalMs"
						min="500"
						max="10000"
						step="500"
						value={settings.captureIntervalMs}
						onChange={handleChange}
						className="w-full accent-slate-800"
					/>
				</div>

				{/* Max Queue Size */}
				<div className="rounded-lg border border-slate-200 bg-white p-3.5">
					<label className="flex items-center justify-between mb-2">
						<span className="text-sm font-bold">Max Queue Size</span>
						<span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-600">{settings.maxQueueSize}</span>
					</label>
					<input
						type="range"
						name="maxQueueSize"
						min="1"
						max="20"
						value={settings.maxQueueSize}
						onChange={handleChange}
						className="w-full accent-slate-800"
					/>
				</div>
			</div>

			<footer className="mt-6 flex items-center justify-between gap-3">
				<button
					onClick={handleReset}
					className="h-9 rounded-md text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
				>
					Reset Defaults
				</button>
				<button
					onClick={handleSave}
					disabled={isSaving}
					className="h-9 min-w-[100px] rounded-md bg-slate-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:opacity-50"
				>
					{isSaving ? "Saving..." : "Save Settings"}
				</button>
			</footer>
		</div>
	);
};

export default Settings;