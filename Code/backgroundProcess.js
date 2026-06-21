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

// Main POST endpoint for deepfake detection
app.post('/api/', async (req, res) => {
  const frames = req.body.frames;
  const timestamp = req.body.timestamp;
  const respondOnce = makeSafeResponder(res);

  if (!frames || frames.length === 0) {
    return respondOnce(400, { error: "No frames received" });
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
});
app.get("/", (req, res) => res.send("✅ Deepfake backend is running"));
app.listen(PORT, () => {
  console.log(`🚀 Deepfake backend running on http://localhost:${PORT}`);
});


