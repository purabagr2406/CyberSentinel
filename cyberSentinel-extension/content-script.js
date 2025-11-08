// --- Configuration ---
const BACKEND_URL = 'http://localhost:5000/api/';
const SNAPSHOT_INTERVAL_MS = 5000; // 5 seconds
const MAX_PARTICIPANTS_TO_CAPTURE = 3;

// --- State ---
let lastCapturedIndex = 0; // Remembers where we left off

// A reusable canvas for capturing snapshots
const captureCanvas = document.createElement("canvas");
const captureContext = captureCanvas.getContext("2d");

// --- Main Logic ---
console.log("CyberSentinel Content Script Loaded!");
setInterval(captureAndSendFrames, SNAPSHOT_INTERVAL_MS);

/**
 * Captures a single frame from a video element.
 * Returns the DataURL string or null if the video is blank.
 */
function captureFrameFromVideo(videoElement) {
  // Skip videos that are blank (width 0)
  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    return null;
  }
  try {
    // Set canvas to the video's size
    captureCanvas.width = videoElement.videoWidth;
    captureCanvas.height = videoElement.videoHeight;
    // Draw the video's current frame
    captureContext.drawImage(videoElement, 0, 0, captureCanvas.width, captureCanvas.height);
    // Get the image data
    return captureCanvas.toDataURL("image/jpeg", 0.8);
  } catch (error) {
    console.error("CyberSentinel: Error capturing frame:", error);
    return null;
  }
}

/**
 * Finds all participant videos, captures a rotating set of 3,
 * and sends an array of frames to the backend.
 */
async function captureAndSendFrames() {
  console.log("Finding video containers...");

  // 1. Find all parent containers with the data-tid
  const parentElements = document.querySelectorAll("[data-tid='calling-stream']");
  
  // 2. Go into each parent and find its video, creating a flat list
  const videoElements = [];
  parentElements.forEach((parent) => {
    const video = parent.querySelector('video');
    if (video) {
      videoElements.push(video);
    }
  });

  if (videoElements.length === 0) {
    console.warn("CyberSentinel: No video elements found.");
    return;
  }

  const framesArray = [];
  let participantsCaptured = 0;

  // 3. Loop through videos, starting from where we left off
  for (let i = 0; i < videoElements.length; i++) {
    
    // Get the next video in the round-robin
    const videoIndex = (lastCapturedIndex + i) % videoElements.length;
    const videoElement = videoElements[videoIndex];

    const frameDataURL = captureFrameFromVideo(videoElement);

    if (frameDataURL) {
      framesArray.push({
        participantId: `video_${videoIndex}`,
        imageData: frameDataURL
      });
      participantsCaptured++;
    }

    // Check if we have our 3 frames
    if (participantsCaptured >= MAX_PARTICIPANTS_TO_CAPTURE) {
      // Save our new position for next time
      lastCapturedIndex = (videoIndex + 1) % videoElements.length;
      break; // Exit the loop
    }
  }

  // If we looped through everyone and didn't break, reset for the next run
  if (participantsCaptured < MAX_PARTICIPANTS_TO_CAPTURE) {
    lastCapturedIndex = 0;
  }

  // 4. Send whatever frames we managed to capture
  if (framesArray.length > 0) {
    console.log(`Sending ${framesArray.length} frames (rotating set) to backend...`);
    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          frames: framesArray,
          timestamp: new Date().toISOString()
        }),
      });

      if (!response.ok) {
        throw new Error(`Backend returned status: ${response.status}`);
      }

      const analysisResult = await response.json();
      console.log("Received analysis:", analysisResult);

    } catch (error) {
      console.error("CyberSentinel Error sending to backend:", error);
    }
  }
}