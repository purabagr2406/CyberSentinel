import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
	clearLatestAnalysis,
	getLatestAnalysis,
	subscribeToAnalysis,
} from "../../features/frameApi";
import {
	analysisCleared,
	analysisReceived,
	selectAnalysisResults,
	selectLatestAnalysis,
} from "../../features/frameAnalysisSlice";
import { useNavigate } from "react-router";
const MODE_CONTROL_KEY = "cyberSentinelControl";

const Home = () => {
	const dispatch = useDispatch();
	const analysis = useSelector(selectLatestAnalysis);
	const results = useSelector(selectAnalysisResults);
	const navigate = useNavigate();
	const [isRunning, setIsRunning] = useState(false);

	// on startup
	useEffect(() => {
		let mounted = true;

		getLatestAnalysis().then((latestAnalysis) => {
			if (mounted) {
				dispatch(analysisReceived(latestAnalysis));
			}
		});

		const unsubscribe = subscribeToAnalysis((latestAnalysis) => {
			dispatch(analysisReceived(latestAnalysis));
		});

		if (globalThis.chrome?.storage?.local) {
			chrome.storage.local.get(MODE_CONTROL_KEY, (data) => {
				// true if not set
				setIsRunning(data[MODE_CONTROL_KEY]?.isRunning ?? true);
			});

			const listener = (changes, area) => {
				if (area === 'local' && changes[MODE_CONTROL_KEY]) {
					setIsRunning(changes[MODE_CONTROL_KEY].newValue.isRunning);
				}
			}

			chrome.storage.onChanged.addListener(listener);
		}
		return () => {
			mounted = false;
			unsubscribe();
			chrome.storage.onChanged.removeListener(listener);
		};
	}, [dispatch]);

	const statusView = useMemo(() => getStatusView(analysis, results), [analysis, results]);

	const handleClear = () => {
		dispatch(analysisCleared());
		clearLatestAnalysis();
	};

	const toggleRunState = () => {
		const newState = !isRunning;
		setIsRunning(newState);
		if (globalThis.chrome?.storage?.local) {
			chrome.storage.local.set({ [MODE_CONTROL_KEY]: { isRunning: newState } });
		}
	};

	return (
		<div className="min-h-[460px] w-[360px] bg-slate-50 p-4.5 text-slate-900">
			<header className="mb-4 flex items-start justify-between gap-4">
				<div>
					<p className="mb-1 text-xs font-bold uppercase text-slate-500">CyberSentinel</p>
					<h1 className="text-[22px] leading-tight font-bold tracking-normal">Live deepfake monitor</h1>
				</div>

				{/* Top Right Container: Status Dot & Settings Button */}
				<div className="flex items-center gap-3">
					<span className={getStatusDotClass(statusView.tone)} aria-label={statusView.label} />
					<button
						onClick={() => navigate('/settings')}
						className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
						aria-label="Go to settings"
						title="Settings"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="3"></circle>
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
						</svg>
					</button>
				</div>
			</header>
			<div className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
				<div>
					<h2 className="text-[13px] font-bold leading-tight">Detection Status</h2>
					<p className="text-xs text-slate-500">{isRunning ? "Actively monitoring" : "Paused"}</p>
				</div>
				<button
					onClick={toggleRunState}
					className={`h-8 min-w-[80px] rounded-md px-3 text-sm font-medium shadow-sm transition-colors ${isRunning
							? "bg-amber-100 text-amber-900 hover:bg-amber-200"
							: "bg-emerald-600 text-white hover:bg-emerald-700"
						}`}
				>
					{isRunning ? "Pause" : "Start"}
				</button>
			</div>
			<section className={getAlertPanelClass(statusView.tone)}>
				<p className="mb-1 text-[13px] font-extrabold">{statusView.label}</p>
				<p className="text-[13px] leading-snug text-slate-600">{statusView.message}</p>
			</section>

			<section className="my-3.5 grid grid-cols-3 gap-2" aria-label="Scan details">
				<div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
					<span className="block text-[11px] font-bold uppercase text-slate-500">Frames sent</span>
					<strong className="mt-1 block text-xl leading-none">{analysis.framesSent || 0}</strong>
				</div>
				<div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
					<span className="block text-[11px] font-bold uppercase text-slate-500">Queue</span>
					<strong className="mt-1 block text-xl leading-none">{analysis.queueSize || 0}</strong>
				</div>
				<div className="min-w-0 rounded-lg border border-slate-200 bg-white p-2.5">
					<span className="block text-[11px] font-bold uppercase text-slate-500">Participants</span>
					<strong className="mt-1 block text-xl leading-none">{results.length}</strong>
				</div>
			</section>

			<section className="rounded-lg border border-slate-200 bg-white p-3.5">
				<div className="mb-3 flex items-center justify-between gap-3">
					<h2 className="text-sm leading-tight font-bold">Latest analysis</h2>
					<button
						type="button"
						className="h-7.5 min-w-14 cursor-pointer rounded-md border border-slate-300 bg-slate-50 px-3 text-sm text-slate-800 hover:bg-slate-100"
						onClick={handleClear}
					>
						Clear
					</button>
				</div>

				{results.length > 0 ? (
					<ul className="grid max-h-44 list-none gap-2 overflow-auto p-0">
						{results.map((item) => (
							<li key={item.participantId} className={getResultItemClass(item.label)}>
								<div className="flex items-center justify-between gap-2.5">
									<strong className="min-w-0 text-[13px]">{item.participantId || "Participant"}</strong>
									<span className="min-w-0 text-[13px]">{item.label || "Unknown"}</span>
								</div>
								{typeof item.real_prob === "number" && (
									<p className="mt-1.5 text-xs leading-snug text-slate-500">
										Real probability: {(item.real_prob * 100).toFixed(1)}%
									</p>
								)}
								{item.error && <p className="mt-1.5 text-xs leading-snug text-slate-500">{item.error}</p>}
							</li>
						))}
					</ul>
				) : (
					<p className="mt-1.5 text-xs leading-snug text-slate-500">{analysis.summary || analysis.message}</p>
				)}
			</section>

			<footer className="mt-3.5 flex items-center justify-between gap-3.5 text-xs text-slate-600">
				<span className="block text-[11px] font-bold uppercase text-slate-500">Last update</span>
				<strong>{formatTimestamp(analysis.updatedAt)}</strong>
			</footer>
		</div>
	);
};

// --- Helper Functions Remain Unchanged ---

function getStatusView(analysis, results) {
	if (analysis.status === "error") {
		return {
			tone: "danger",
			label: "Connection issue",
			message: analysis.message || "The backend could not return an analysis.",
		};
	}

	if (results.some((item) => item.label === "Fake")) {
		return {
			tone: "danger",
			label: "Possible deepfake detected",
			message: "One or more participant frames were classified as fake.",
		};
	}

	if (results.some((item) => item.label === "Uncertain" || item.label === "Error")) {
		return {
			tone: "warning",
			label: "Review recommended",
			message: "The latest batch contains an uncertain or incomplete result.",
		};
	}

	if (analysis.status === "ready" && results.length > 0) {
		return {
			tone: "safe",
			label: "No deepfake signal",
			message: "The latest participant frames were classified as real.",
		};
	}

	if (analysis.status === "analyzing") {
		return {
			tone: "neutral",
			label: "Analyzing frames",
			message: analysis.message || "The latest participant frames are being checked.",
		};
	}

	if (analysis.status === "no-video") {
		return {
			tone: "neutral",
			label: "No video visible",
			message: analysis.message || "No participant video is currently visible.",
		};
	}

	return {
		tone: "neutral",
		label: "Waiting for scan",
		message: analysis.message || "Join a supported Teams call and keep the backend running.",
	};
}

function getResultTone(label) {
	if (label === "Fake" || label === "Error") {
		return "danger";
	}

	if (label === "Uncertain") {
		return "warning";
	}

	return "safe";
}

function getStatusDotClass(tone) {
	const baseClass = "mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full";
	const toneClasses = {
		safe: "bg-emerald-700 shadow-[0_0_0_5px_rgba(22,128,90,0.14)]",
		warning: "bg-amber-700 shadow-[0_0_0_5px_rgba(183,121,31,0.16)]",
		danger: "bg-red-700 shadow-[0_0_0_5px_rgba(197,48,48,0.15)]",
		neutral: "bg-slate-400 shadow-[0_0_0_5px_rgba(133,147,163,0.14)]",
	};

	return `${baseClass} ${toneClasses[tone] || toneClasses.neutral}`;
}

function getAlertPanelClass(tone) {
	const baseClass = "rounded-lg border p-3.5";
	const toneClasses = {
		safe: "border-emerald-300 bg-emerald-50",
		warning: "border-amber-300 bg-amber-50",
		danger: "border-red-300 bg-red-50",
		neutral: "border-slate-200 bg-white",
	};

	return `${baseClass} ${toneClasses[tone] || toneClasses.neutral}`;
}

function getResultItemClass(label) {
	const baseClass = "rounded-md border-l-4 bg-slate-50 p-2.5";
	const toneClasses = {
		safe: "border-l-emerald-700",
		warning: "border-l-amber-700",
		danger: "border-l-red-700",
	};

	return `${baseClass} ${toneClasses[getResultTone(label)] || toneClasses.safe}`;
}

function formatTimestamp(value) {
	if (!value) {
		return "Not yet";
	}

	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(value));
}

export default Home;