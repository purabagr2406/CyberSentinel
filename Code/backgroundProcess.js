const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { spawn } = require("child_process");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors({origin: ["https://teams.microsoft.com",
    "https://teams.live.com"],
			credentials: true}));
app.use(bodyParser.json({ limit: "50mb" }));

// Main POST endpoint for deepfake detection
app.post("/api/", async (req, res) => {
  const frames = req.body.frames;
  const timestamp = req.body.timestamp;

  if (!frames || frames.length === 0) {
    return res.status(400).json({ error: "No frames received" });
  }

  try {
    // Spawn Python process
    const python = spawn("python", ["predict.py"]);

    let outputData = "";
    let errorData = "";

    // Collect Python stdout
    python.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    // Collect stderr
    python.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    // When process exits
    python.on("close", (code) => {
      if (errorData) {
        console.error("Python Error:", errorData);
      }

      try {
        const result = JSON.parse(outputData);
        res.json(result);
      } catch (err) {
        console.error("JSON Parse Error:", err);
        res.status(500).json({ error: "Failed to parse Python output" });
      }
    });

    // Send JSON to Python via stdin
    python.stdin.write(JSON.stringify({ frames, timestamp }));
    python.stdin.end();
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Deepfake backend running on http://localhost:${PORT}`);
});
