CyberSentinel 🛡️
CyberSentinel is a Chrome extension that analyzes video conferencing platforms (like Microsoft Teams) by capturing and processing participant video frames in near real-time.

It's built with a Vite/React frontend and a Node.js + Python backend. The core of the project is a content script that intelligently captures video frames and sends them to a local server for machine learning analysis.

Features
Real-time Frame Capture: Injects a content script into video meetings to capture snapshots from participant video streams.

Intelligent Frame Queue: Uses a producer-consumer model to efficiently capture frames (producer) and send them to the backend (consumer) one at a time, preventing network overlaps.

Round-Robin Selection: Cycles through participants to capture frames from different people, rather than just the first few.

ML-Powered Backend: Sends captured frames to a Node.js backend, which in turn spawns a Python process to run a machine learning analysis model.

Technology Stack
Frontend (Extension):

Google Chrome Extension (Manifest V3)

Vite + React (for the extension popup UI)

JavaScript (ESM) (for the content-script.js)

Backend:

Node.js / Express (as the API server)

Python: Spawned as a child process from Node.js to run the ML model.

Project Structure
This repository contains two main projects: the extension frontend and the API backend.

/CyberSentinel/
│
├── cyberSentinel-extension/  <-- The Chrome Extension
│   ├── manifest.json
│   ├── content-script.js
│   ├── icons/
│   └── frontend/             <-- The React popup app
│       ├── src/
│       ├── dist/
│       └── package.json
│
└── cyberSentinel-backend/    <-- The Node.js/Express Server
    ├── backgroundProcess.js  (or server.js)
    ├── predict.py            (Your ML script)
    └── package.json
🚀 Getting Started
To run this project, you need to set up both the backend server and the frontend extension.

1. Backend Setup
The backend server runs on http://localhost:5000.

Bash

# 1. Navigate to the backend directory
cd cyberSentinel-backend

# 2. Install dependencies
npm install

# 3. (If using Python) Set up your Python environment
# It's recommended to use a virtual environment
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 4. Start the server
npm start
Your backend will now be running on http://localhost:5000.

2. Frontend (Extension) Setup
First, you must build the React popup app.

Bash

# 1. Navigate to the React app's folder
cd cyberSentinel-extension/frontend

# 2. Install dependencies
npm install

# 3. Build the static files
# This creates the 'frontend/dist' folder
npm run build
Now, load the extension into Chrome:

Open Google Chrome and navigate to chrome://extensions.

Turn on "Developer mode" in the top-right corner.

Click the "Load unpacked" button.

Select the entire cyberSentinel-extension folder (the one containing manifest.json).

The CyberSentinel icon will appear in your toolbar.

How It Works
This project uses a Producer-Consumer model for robust frame capturing.

Producer (content-script.js): A loop runs every second on the Teams page. It finds all video elements, captures a batch of 3 (using a round-robin system), and pushes them into a local frameQueue. This process does not wait for the network.

Consumer (content-script.js): A separate, infinite async loop constantly checks the frameQueue.

If the queue has frames, it pulls one batch (.shift()).

It sends this batch to http://localhost:5000/api/ and waits for the response.

Once the response is received, the loop repeats and checks for the next batch.

This architecture ensures that frame capture is fast and consistent, while network requests are handled safely one at a time, preventing overlaps and race conditions.