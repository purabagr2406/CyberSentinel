// --- Configuration ---
const BACKEND_URL = 'http://localhost:5000/api/';
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

        if (!response.ok) {
          throw new Error(`Backend returned status: ${response.status}`);
        }

        const analysisResult = await response.json();
        console.log("CONSUMER: Received analysis:", analysisResult);

      } catch (error) {
        console.error("CONSUMER Error:", error);
      }
      
    } else {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

console.log("CyberSentinel Content Script Loaded!");

setInterval(produceFrameBatch, PRODUCER_INTERVAL_MS);

runConsumerLoop();