// --- Configuration ---
const BACKEND_URL = "http://127.0.0.1:5000/api/analyze";
const BACKEND_HEALTH_URL = "http://127.0.0.1:5000/health";
const CONNECTION_CHECK_INTERVAL_MS = 10000;

// Storage Keys matching your React app
const ANALYSIS_STORAGE_KEY = "cyberSentinelLatestAnalysis";
const SETTINGS_STORAGE_KEY = "cyberSentinelSettings";
const MODE_CONTROL_KEY = "cyberSentinelControl"; // Added for Play/Pause

// Dynamic Settings (loaded from Chrome storage)
let activeSettings = {
  participantLimit: 6,
  framesPerBatch: 3,
  captureIntervalMs: 1000,
  maxQueueSize: 5,
  startupMode: "auto", // Added startup preference
};

// --- State ---
const frameQueue = []; // Our "data structure" (the queue)
let lastCapturedIndex = 0; // Remembers where we left off
let lastConnectionState = "unknown";
let lastVideoPresenceState = "unknown";
let producerIntervalId = null; // Used to manage the dynamic capture interval
let isRunning = false; // The master switch for Auto/Manual play state

// A reusable canvas for capturing snapshots
const captureCanvas = document.createElement("canvas");
const captureContext = captureCanvas.getContext("2d");

console.log("CyberSentinel: Content script initialized.");
console.log(
  "CyberSentinel: Frontend development setup active. Expecting temporary backend responses from http://127.0.0.1:5000."
);

// --- Settings & Control Management ---

function canUseExtensionStorage() {
  return typeof chrome !== "undefined" && chrome.storage?.local;
}

function applyNewSettings(newSettings) {
  if (!newSettings) return;

  const previousInterval = activeSettings.captureIntervalMs;
  
  // Merge incoming settings
  activeSettings = { ...activeSettings, ...newSettings };
  console.log("CyberSentinel: Settings updated to", activeSettings);

  // If the user changed the capture interval time, restart the loop timer (it will only run if isRunning === true)
  if (previousInterval !== activeSettings.captureIntervalMs) {
    console.log(`PRODUCER: Adjusting capture interval to ${activeSettings.captureIntervalMs}ms`);
    startProducerLoop(); 
  }
}

function applyControlState(controlState) {
  if (!controlState || typeof controlState.isRunning !== "boolean") return;
  
  if (controlState.isRunning !== isRunning) {
    isRunning = controlState.isRunning;
    console.log(`CyberSentinel: Detection state changed. isRunning = ${isRunning}`);
    
    if (isRunning) {
      startProducerLoop();
    } else {
      // Pause detection: clear interval and wipe the queue
      if (producerIntervalId) {
        clearInterval(producerIntervalId);
      }
      frameQueue.length = 0; 
      publishAnalysisStatus({
        status: "neutral",
        message: "Detection is manually paused.",
        queueSize: 0,
        framesSent: 0,
      });
    }
  }
}

async function initializeSettings() {
  if (!canUseExtensionStorage()) return;

  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_STORAGE_KEY, (data) => {
      if (data[SETTINGS_STORAGE_KEY]) {
        applyNewSettings(data[SETTINGS_STORAGE_KEY]);
      }
      resolve();
    });
  });
}

// Listen for settings changes and play/pause toggles
if (canUseExtensionStorage()) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes[SETTINGS_STORAGE_KEY]) {
        applyNewSettings(changes[SETTINGS_STORAGE_KEY].newValue);
      }
      if (changes[MODE_CONTROL_KEY]) {
        applyControlState(changes[MODE_CONTROL_KEY].newValue);
      }
    }
  });
}

// --- Helper Functions ---

function publishAnalysisStatus(statusUpdate) {
  if (!canUseExtensionStorage()) {
    return;
  }

  chrome.storage.local.set({
    [ANALYSIS_STORAGE_KEY]: {
      ...statusUpdate,
      sourceUrl: window.location.href,
      updatedAt: new Date().toISOString(),
    },
  });
}

async function checkBackendConnection() {
  try {
    const response = await fetch(BACKEND_HEALTH_URL, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    const health = await response.json();
    if (lastConnectionState !== "connected") {
      console.log(
        `CyberSentinel: Backend connected. Mode: ${health.mode || "unknown"}. Temporary result: ${health.temporaryResult || "no"}.`
      );
      lastConnectionState = "connected";
    }
  } catch (error) {
    if (lastConnectionState !== "disconnected") {
      console.warn(
        `CyberSentinel: Backend disconnected. Start the server at http://127.0.0.1:5000 before testing the popup. ${error.message}`
      );
      lastConnectionState = "disconnected";
    }
  }
}

function captureFrameFromVideo(videoElement) {
  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    return null;
  }
  try {
    captureCanvas.width = videoElement.videoWidth;
    captureCanvas.height = videoElement.videoHeight;
    captureContext.drawImage(videoElement, 0, 0, captureCanvas.width, captureCanvas.height);
    return captureCanvas.toDataURL("image/jpeg", 0.8);
  } catch (error) {
    console.error("CyberSentinel: Error capturing frame:", error);
    return null;
  }
}

// --- Producer & Consumer ---

function produceFrameBatch() {
  const parentElements = document.querySelectorAll("[data-tid='calling-stream']");
  const videoElements = [];
  parentElements.forEach((parent) => {
    const video = parent.querySelector('video');
    if (video) {
      videoElements.push(video);
    }
  });

  if (videoElements.length === 0) {
    if (lastVideoPresenceState !== "none") {
      console.log("PRODUCER: No participant video streams detected.");
      publishAnalysisStatus({
        status: "no-video",
        message: "No participant video is currently visible.",
        queueSize: frameQueue.length,
        framesSent: 0,
      });
      lastVideoPresenceState = "none";
    }
    return;
  }

  if (lastVideoPresenceState !== "visible") {
    console.log(`PRODUCER: Detected ${videoElements.length} participant video stream(s).`);
    lastVideoPresenceState = "visible";
  }

  const batchArray = [];
  let participantsCaptured = 0;

  for (let i = 0; i < videoElements.length; i++) {
    const videoIndex = (lastCapturedIndex + i) % videoElements.length;
    const videoElement = videoElements[videoIndex];
    const frameDataURL = captureFrameFromVideo(videoElement);

    if (frameDataURL) {
      batchArray.push({
        participantId: `video_${videoIndex}`,
        imageData: frameDataURL
      });
      participantsCaptured++;
    }

    if (participantsCaptured >= activeSettings.participantLimit) {
      lastCapturedIndex = (videoIndex + 1) % videoElements.length;
      break;
    }
  }

  if (participantsCaptured < activeSettings.participantLimit) {
    lastCapturedIndex = 0;
  }

  if (batchArray.length > 0) {
    if (frameQueue.length >= activeSettings.maxQueueSize) {
      frameQueue.shift();
      console.warn(
        `PRODUCER: Queue limit reached. Dropped oldest batch. Queue limit: ${activeSettings.maxQueueSize}`
      );
    }

    frameQueue.push(batchArray);
    console.log(`PRODUCER: Added batch of ${batchArray.length} frames. Queue size: ${frameQueue.length}`);
  }
}

function startProducerLoop() {
  if (producerIntervalId) {
    clearInterval(producerIntervalId);
  }
  // Only start the capture interval if the play state is active
  if (isRunning) {
    producerIntervalId = setInterval(produceFrameBatch, activeSettings.captureIntervalMs);
  }
}

function formatAnalysisResponse(responseData) {
  if (typeof responseData.result === "string") {
    return responseData.result;
  }

  const items = Array.isArray(responseData.results)
    ? responseData.results
    : Array.isArray(responseData.details?.results)
      ? responseData.details.results
      : [];

  if (items.length === 0) {
    return null;
  }

  return items
    .map((item) => {
      const prob = item.real_prob !== undefined ? ` (${item.real_prob})` : "";
      const extraError = item.error ? ` [${item.error}]` : "";
      return `${item.participantId}: ${item.label}${prob}${extraError}`;
    })
    .join(" | ");
}

async function runConsumerLoop() {
  console.log("CONSUMER: Loop started. Waiting for frames...");

  while (true) {
    // Only process the queue if detection is actively running
    if (isRunning && frameQueue.length > 0) {
      const batchToSend = frameQueue.shift(); 
      
      console.log(`CONSUMER: Sending batch of ${batchToSend.length}. Queue size: ${frameQueue.length}`);
      publishAnalysisStatus({
        status: "analyzing",
        message: "Analyzing the latest participant frames.",
        queueSize: frameQueue.length,
        framesSent: batchToSend.length,
      });

      try {
        const response = await fetch(BACKEND_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frames: batchToSend,
            timestamp: new Date().toISOString()
          }),
        });
        const responseData = await response.json();

        if (!response.ok || responseData.success === false) {
          console.warn("CONSUMER: Backend returned no analysis.", {
            status: response.status,
            body: responseData,
          });
          publishAnalysisStatus({
            status: "error",
            message: responseData.error || "Backend returned no analysis.",
            httpStatus: response.status,
            queueSize: frameQueue.length,
            framesSent: batchToSend.length,
          });
          continue;
        }
				console.log("CONSUMER: Backend response received:", responseData);
				
        const analysisResult = formatAnalysisResponse(responseData);
        if (!analysisResult) {
          console.warn("CONSUMER: Response had no usable analysis payload.", responseData);
          publishAnalysisStatus({
            status: "error",
            message: "Response had no usable analysis payload.",
            queueSize: frameQueue.length,
            framesSent: batchToSend.length,
          });
          continue;
        }

        console.log("CONSUMER: Received analysis:", analysisResult);

        publishAnalysisStatus({
          status: "ready",
          summary: analysisResult,
          results: responseData.details?.results || responseData.results || [],
          timestamp: responseData.details?.timestamp || new Date().toISOString(),
          queueSize: frameQueue.length,
          framesSent: batchToSend.length,
        });

      } catch (error) {
        console.error("CONSUMER Error:", error);
        publishAnalysisStatus({
          status: "error",
          message: error.message || "Could not contact backend.",
          queueSize: frameQueue.length,
          framesSent: batchToSend.length,
        });
      }
      
    } else {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

// --- Initialization ---
async function startApp() {
  console.log("CyberSentinel Content Script Loading Settings...");
  await initializeSettings();
  
  // Determine if we should start running immediately
  if (canUseExtensionStorage()) {
    chrome.storage.local.get(MODE_CONTROL_KEY, (data) => {
      let startNow = activeSettings.startupMode === "auto";

      // If the user previously toggled the state manually, respect it
      if (data[MODE_CONTROL_KEY] !== undefined && data[MODE_CONTROL_KEY].isRunning !== undefined) {
        startNow = data[MODE_CONTROL_KEY].isRunning;
      }

      applyControlState({ isRunning: startNow });
      
      // Sync the decided state back so the React popup displays correctly
      chrome.storage.local.set({ [MODE_CONTROL_KEY]: { isRunning: startNow } });
    });
  }
  
  checkBackendConnection();
  setInterval(checkBackendConnection, CONNECTION_CHECK_INTERVAL_MS);
  
  // The producer loop will be started by applyControlState if isRunning is true
  runConsumerLoop();
}

startApp();