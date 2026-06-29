const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;
const VENV_PYTHON = path.join(__dirname, "..", "venv", "Scripts", "python.exe");
const PYTHON_CMD = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python";

app.use(cors({ origin: "*", credentials: true }));
app.use(bodyParser.json({ limit: "50mb" }));

// --- Persistent Python Worker Setup ---
let pythonProcess = null;
let outputBuffer = "";
const pendingRequests = new Map(); // Stores HTTP requests waiting for Python

function startPythonWorker() {
	console.log("Server: Starting persistent Python worker...");
	pythonProcess = spawn(PYTHON_CMD, ["-u", "predict.py"], {
		cwd: __dirname,
		env: { ...process.env, TF_CPP_MIN_LOG_LEVEL: "2" },
	});

	// Handle data coming FROM Python
	pythonProcess.stdout.on("data", (data) => {
		outputBuffer += data.toString();

		// Parse data line by line (handles chunked stream data safely)
		let newlineIndex;
		while ((newlineIndex = outputBuffer.indexOf("\n")) > -1) {
			const line = outputBuffer.slice(0, newlineIndex).trim();
			outputBuffer = outputBuffer.slice(newlineIndex + 1);

			if (!line) continue;

			try {
				const result = JSON.parse(line);

				if (result.status === "ready") {
					console.log("Server: Python worker is fully loaded and ready.");
					continue;
				}

				// Match the Python response to the correct waiting HTTP Request
				const reqId = result.requestId;
				if (reqId && pendingRequests.has(reqId)) {
					const { res } = pendingRequests.get(reqId);
					pendingRequests.delete(reqId); // Remove from queue

					if (result.error) {
						res.status(500).json({ success: false, error: result.error });
					} else {
						// Build the summary string
						const summary = result.results
							.map(item => `${item.participantId}: ${item.label} (${item.real_prob})`)
							.join(" | ");
						console.log(`Server: Sending response for request ${reqId}: ${summary}`);
						res.status(200).json({
							success: true,
							result: summary,
							details: result,
						});
					}
				}
			} catch (err) {
				console.error("Failed to parse Python output line:", line);
			}
		}
	});

	pythonProcess.stderr.on("data", (data) => {
		console.warn("Python Log/Error:", data.toString().trim());
	});

	pythonProcess.on("close", (code) => {
		console.error(`Python process exited with code ${code}. Restarting in 3 seconds...`);
		// Optional: Auto-restart if Python crashes
		setTimeout(startPythonWorker, 3000);
	});
}

// Boot Python as soon as Node starts
startPythonWorker();

// --- HTTP Route ---
app.post("/api/analyze", (req, res) => {
	const frames = req.body.frames;
	const timestamp = req.body.timestamp;

	if (!frames || frames.length === 0) {
		return res.status(400).json({ error: "No frames received" });
	}

	// 1. Generate a unique ID for this specific API request
	const reqId = Date.now().toString() + "-" + Math.random().toString(36).substr(2, 9);

	// 2. Store the Express 'res' object so we can respond later when Python finishes
	pendingRequests.set(reqId, { res });

	// 3. Optional timeout (If Python gets stuck, don't leave the Chrome extension hanging forever)
	setTimeout(() => {
		if (pendingRequests.has(reqId)) {
			pendingRequests.delete(reqId);
			res.status(504).json({ error: "Analysis timed out (Python took too long)" });
		}
	}, 30000); // 30 seconds

	// 4. Send the payload to Python's stdin as a single line

	const payload = JSON.stringify({ requestId: reqId, frames, timestamp });
	console.log(`Server: Sending request ${reqId} to Python worker with ${frames.length} frames.`);
	pythonProcess.stdin.write(payload + "\n");
});

app.get("/health", (req, res) => {
	console.log("Server: Health check requested.");
	res.json({ ok: true, pythonWorkerAlive: pythonProcess && !pythonProcess.killed });
});

app.listen(PORT, () => {
	console.log(`Server: CyberSentinel backend running on http://localhost:${PORT}`);
});