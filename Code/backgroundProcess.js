const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 5000;
const VENV_PYTHON = path.join(__dirname, "venv", "Scripts", "python.exe");
const PYTHON_CMD = fs.existsSync(VENV_PYTHON) ? VENV_PYTHON : "python";
const USE_TEMP_MODEL_RESPONSE = true;

// Middleware
app.use(
  cors({
    origin: [
      "https://teams.microsoft.com",
      "https://*.teams.microsoft.com",
      "https://teams.live.com",
      "https://*.teams.live.com",
      "https://outlook.office.com",
      "https://*.office.com",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  })
);

app.use(bodyParser.json({ limit: "50mb" }));

function makeSafeResponder(res) {
  let sent = false;
  return (statusCode, payload) => {
    if (sent) return;
    sent = true;
    res.status(statusCode).json(payload);
  };
}

function buildTemporaryDetectionResponse(frames, timestamp) {
  const normalizedResult = (process.env.TEMP_DEEPFAKE_RESULT || "no").toLowerCase();
  const isDeepfake = normalizedResult === "yes" || normalizedResult === "true";
  const label = isDeepfake ? "Fake" : "Real";
  const realProb = isDeepfake ? 0.12 : 0.91;
  const fakeProb = 1 - realProb;

  const results = frames.map((frame, index) => ({
    participantId: frame.participantId || `video_${index}`,
    deepfake: isDeepfake ? "yes" : "no",
    label,
    real_prob: realProb,
    fake_prob: fakeProb,
    confidence: 0.82,
    used_face_crop: false,
    frames_analyzed: 1,
    vote_breakdown: {
      real: isDeepfake ? 0 : 1,
      fake: isDeepfake ? 1 : 0,
      uncertain: 0,
    },
  }));

  const summary = results
    .map((item) => `${item.participantId}: deepfake=${item.deepfake}`)
    .join(" | ");

  return {
    success: true,
    result: summary,
    details: {
      timestamp,
      temporary: true,
      results,
    },
  };
}

function getServerMode() {
  return USE_TEMP_MODEL_RESPONSE ? "temporary-frontend-development" : "model-backed";
}

app.get("/health", (req, res) => {
  const mode = getServerMode();
  console.log(`Server: Health check received. Connection OK. Mode: ${mode}.`);
  res.json({
    ok: true,
    service: "CyberSentinel backend",
    mode,
    temporaryModelResponse: USE_TEMP_MODEL_RESPONSE,
    temporaryResult: process.env.TEMP_DEEPFAKE_RESULT || "no",
  });
});

// REST endpoint handler for deepfake detection.
async function handleAnalyzeFrames(req, res) {
  const frames = req.body.frames;
  const timestamp = req.body.timestamp;
  const respondOnce = makeSafeResponder(res);

  console.log(
    `Server: Received ${Array.isArray(frames) ? frames.length : 0} frame(s) at ${timestamp || "no timestamp"}.`
  );

  if (!frames || frames.length === 0) {
    console.warn("Server: Request rejected because no frames were received.");
    return respondOnce(400, { error: "No frames received" });
  }

  if (USE_TEMP_MODEL_RESPONSE) {
    const temporaryResponse = buildTemporaryDetectionResponse(frames, timestamp);
    console.log(
      `Server: Temporary model mode active. Sending result: ${temporaryResponse.result}`
    );
    return respondOnce(200, temporaryResponse);
  }

  try {
    // Spawn Python process from this folder so relative paths in predict.py are stable.
    const python = spawn(PYTHON_CMD, ["-u", "predict.py"], {
      cwd: __dirname,
      env: {
        ...process.env,
        TF_CPP_MIN_LOG_LEVEL: "2",
      },
    });

    let outputData = "";
    let errorData = "";

    python.on("error", (err) => {
      console.error("Python Spawn Error:", err);
      respondOnce(500, { error: `Failed to start Python process: ${err.message}` });
    });

    // Collect Python stdout
    python.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    // Collect stderr
    python.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    python.stdin.on("error", (err) => {
      console.error("Python stdin error:", err.message);
      respondOnce(500, {
        error: "Could not send frames to Python process",
        details: err.message,
      });
    });

    console.log("Server: Sent frames to Python for analysis.");

    // When process exits
    python.on("close", (code) => {
      if (code !== 0) {
        if (errorData) {
          console.error("Python Error:", errorData);
        }
        return respondOnce(500, {
          error: `Python process exited with code ${code}`,
          details: errorData || "No stderr output",
        });
      }

      if (errorData) {
        // TensorFlow may write non-fatal startup messages to stderr.
        console.warn("Python stderr (non-fatal):", errorData);
      }

      try {
        const trimmed = outputData.trim();
        if (!trimmed) {
          return respondOnce(500, {
            error: "Python returned empty output",
            details: errorData || "No output on stdout",
          });
        }
        const result = JSON.parse(trimmed);
        if (result.error) {
          console.error("Python returned error payload:", result.error);
          return respondOnce(500, {
            success: false,
            error: result.error,
            details: errorData || null,
          });
        }

        const items = Array.isArray(result.results) ? result.results : [];
        if (items.length === 0) {
          console.log("Analysis complete: no frame results returned.");
          return respondOnce(400, {
            success: false,
            error: "Python returned no frame results",
            details: result,
          });
        } else {
          const summary = items
            .map((item) => {
              const prob = item.real_prob !== undefined ? ` (${item.real_prob})` : "";
              return `${item.participantId}: ${item.label}${prob}`;
            })
            .join(" | ");
          console.log(`Analysis complete: ${summary}`);
          return respondOnce(200, {
            success: true,
            result: summary,
            details: result,
          });
        }
        
      } catch (err) {
        console.error("JSON Parse Error:", err);
        respondOnce(500, {
          error: "Failed to parse Python output",
          details: outputData.slice(0, 1000),
        });
      }
    });

    // Send JSON to Python via stdin
    python.stdin.end(JSON.stringify({ frames, timestamp }));
  } catch (err) {
    console.error("Server Error:", err);
    respondOnce(500, { error: err.message });
  }
}

// Main REST POST endpoint for deepfake detection.
app.post("/api/analyze", handleAnalyzeFrames);

// Backward-compatible route for older content scripts.
app.post("/api/", handleAnalyzeFrames);
app.get("/", (req, res) => res.send("✅ Deepfake backend is running"));
app.listen(PORT, () => {
  console.log(`Server: CyberSentinel backend running on http://localhost:${PORT}`);
  console.log(`Server: Connection health endpoint ready at http://localhost:${PORT}/health`);
  if (USE_TEMP_MODEL_RESPONSE) {
    console.log(
      `Server: Temporary frontend-development mode enabled. API will return TEMP_DEEPFAKE_RESULT=${process.env.TEMP_DEEPFAKE_RESULT || "no"}.`
    );
  }
});


