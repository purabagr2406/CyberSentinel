import { useEffect, useMemo, useState } from "react";
import {
	clearLatestAnalysis,
	DEFAULT_ANALYSIS_STATE,
	getLatestAnalysis,
	subscribeToAnalysis,
} from "../../features/frameApi";

const Home = () => {
	const [analysis, setAnalysis] = useState(DEFAULT_ANALYSIS_STATE);

	useEffect(() => {
		let mounted = true;

		getLatestAnalysis().then((latestAnalysis) => {
			if (mounted) {
				setAnalysis(latestAnalysis);
			}
		});

		const unsubscribe = subscribeToAnalysis(setAnalysis);

		return () => {
			mounted = false;
			unsubscribe();
		};
	}, []);

	const results = useMemo(
		() => (Array.isArray(analysis.results) ? analysis.results : []),
		[analysis.results],
	);
	const statusView = useMemo(() => getStatusView(analysis, results), [analysis, results]);

	return (
		<div className="popup-shell">
			<header className="popup-header">
				<div>
					<p className="eyebrow">CyberSentinel</p>
					<h1>Live deepfake monitor</h1>
				</div>
				<span className={`status-dot ${statusView.tone}`} aria-label={statusView.label} />
			</header>

			<section className={`alert-panel ${statusView.tone}`}>
				<p className="alert-label">{statusView.label}</p>
				<p className="alert-message">{statusView.message}</p>
			</section>

			<section className="metrics-grid" aria-label="Scan details">
				<div>
					<span>Frames sent</span>
					<strong>{analysis.framesSent || 0}</strong>
				</div>
				<div>
					<span>Queue</span>
					<strong>{analysis.queueSize || 0}</strong>
				</div>
				<div>
					<span>Participants</span>
					<strong>{results.length}</strong>
				</div>
			</section>

			<section className="results-panel">
				<div className="section-title">
					<h2>Latest analysis</h2>
					<button type="button" onClick={clearLatestAnalysis}>Clear</button>
				</div>

				{results.length > 0 ? (
					<ul className="result-list">
						{results.map((item) => (
							<li key={item.participantId} className={getResultTone(item.label)}>
								<div>
									<strong>{item.participantId || "Participant"}</strong>
									<span>{item.label || "Unknown"}</span>
								</div>
								{typeof item.real_prob === "number" && (
									<p>Real probability: {(item.real_prob * 100).toFixed(1)}%</p>
								)}
								{item.error && <p>{item.error}</p>}
							</li>
						))}
					</ul>
				) : (
					<p className="empty-state">{analysis.summary || analysis.message}</p>
				)}
			</section>

			<footer>
				<span>Last update</span>
				<strong>{formatTimestamp(analysis.updatedAt)}</strong>
			</footer>
		</div>
	);
};

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

export default Home
