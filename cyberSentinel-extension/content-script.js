// --- Configuration ---
const BACKEND_URL = 'http://127.0.0.1:5000/api/';
// How often to CAPTURE a new batch of frames
const PRODUCER_INTERVAL_MS = 1000; // Capture a new batch every 1 second
const MAX_PARTICIPANTS_TO_CAPTURE = 3;

// --- State ---
const frameQueue = []; // Our "data structure" (the queue)
let lastCapturedIndex = 0; // Remembers where we left off

// A reusable canvas for capturing snapshots
const captureCanvas = document.createElement("canvas");
const captureContext = captureCanvas.getContext("2d");

console.log("CyberSentinel: Content script initialized.");
// --- Helper Functions ---

/**
 * Captures a single frame from a video element.
 * Returns the DataURL string or null if the video is blank.
 */
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
    return; // No videos, do nothing
  }

  const batchArray = [];
  let participantsCaptured = 0;

  for (let i = 0; i < videoElements.length; i++) {
    const videoIndex = (lastCapturedIndex + i) % videoElements.length;
    const videoElement = videoElements[videoIndex];
    const frameDataURL = captureFrameFromVideo(videoElement);

    if (frameDataURL) {
      console.log(frameDataURL);
      batchArray.push({
        participantId: `video_${videoIndex}`,
        imageData: frameDataURL
      });
      participantsCaptured++;
    }

    if (participantsCaptured >= MAX_PARTICIPANTS_TO_CAPTURE) {
      lastCapturedIndex = (videoIndex + 1) % videoElements.length;
      break;
    }
  }

  if (participantsCaptured < MAX_PARTICIPANTS_TO_CAPTURE) {
    lastCapturedIndex = 0;
  }

  // If we got frames, add the whole batch to the queue
  if (batchArray.length > 0) {
    frameQueue.push(batchArray);
    console.log(`PRODUCER: Added batch of ${batchArray.length} frames. Queue size: ${frameQueue.length}`);
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
// -----------------------------------------------------------------
async function runConsumerLoop() {
  console.log("CONSUMER: Loop started. Waiting for frames...");

  while (true) {
    // Check if there's anything in the queue
    if (frameQueue.length > 0) {
      
      // 1. Get the OLDEST batch from the queue
      const batchToSend = frameQueue.shift(); // .shift() pulls from the front
      
      console.log(`CONSUMER: Sending batch of ${batchToSend.length}. Queue size: ${frameQueue.length}`);

      // 2. Send it and WAIT for the response
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
          continue;
        }

        const analysisResult = formatAnalysisResponse(responseData);
        if (!analysisResult) {
          console.warn("CONSUMER: Response had no usable analysis payload.", responseData);
          continue;
        }

        console.log("CONSUMER: Received analysis:", analysisResult);
        if (responseData.details) {
          console.log("CONSUMER: Raw backend details:", responseData.details);
        }

        

      } catch (error) {
        console.error("CONSUMER Error123:", error);
      }
      
    } else {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

console.log("CyberSentinel Content Script Loaded!");

setInterval(produceFrameBatch, PRODUCER_INTERVAL_MS);

runConsumerLoop();
