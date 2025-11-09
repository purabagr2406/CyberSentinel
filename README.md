# CyberSentinel 🛡️

**Team: Git_Commit**
* Priyansh Sharma (Leader)
* Purab Agarwal
* Rishabh Singh
* Satyam Shahi

CyberSentinel is a Chrome extension that provides real-time deepfake detection for video conferencing platforms like Microsoft Teams. It intelligently captures participant video frames and sends them to a local backend for machine learning analysis.

The project is built on a hybrid Node.js + Python backend, allowing a lightweight Express server to interface with a powerful Keras/TensorFlow model.

## Features

* **Direct Stream Capture:** Injects a content script directly into video calls to capture high-quality snapshots from `<video>` elements.
* **Intelligent Queue System:** Implements a **Producer-Consumer** pattern to ensure stable performance.
    * **Producer:** A loop captures a new batch of 3 frames (in a round-robin cycle) every second and adds them to a queue.
    * **Consumer:** A separate loop pulls one batch from the queue, sends it to the backend, and **waits** for a response before sending the next.
* **Hybrid Backend:** Uses a Node.js server (`backgroundProcess.js`) as a lightweight API that spawns a Python child process (`predict.py`) to handle heavy ML inference.
* **React/Vite UI:** Includes a modern popup interface built with React and Vite.

---

## How It Works (Architecture)

The data flow is designed to be robust and efficient:

1.  **Content Script (Producer):** The `content-script.js` running on the Teams page finds all participant videos. A `setInterval` loop runs every second, capturing 3 frames using a round-robin index, and pushes this batch into a `frameQueue`.
2.  **Content Script (Consumer):** A separate `while(true)` loop checks the `frameQueue`. It pulls one batch, sends it to the backend via `fetch`, and waits for the request to complete before checking the queue again.
3.  **Node.js Server:** The `backgroundProcess.js` (Express) server receives the JSON payload. It immediately spawns the `predict.py` script.
4.  **Python Script:** The Node server pipes the JSON data to `predict.py`'s `stdin`. The Python script loads the Keras model, decodes the base64 images, runs `model.predict()`, and `prints` the final result as a JSON string to `stdout`.
5.  **Response:** The Node server captures the `stdout` from Python, parses the JSON, and sends it back to the content script in the browser.

`[Browser: Content Script] ➔ [Node.js: Express Server] ➔ [Python: Keras Model]`

---

## Technology Stack

* **Chrome Extension:** Manifest V3, JavaScript (ESM)
* **Popup UI:** React, Vite
* **Backend Server:** Node.js, Express, `child_process`
* **Machine Learning:** Python, TensorFlow/Keras, OpenCV, NumPy

Project Structure

/CyberSentinel/
│
├── Code/  (Backend Server)
│   ├── backgroundProcess.js  (Node.js API)
│   ├── predict.py            (Python ML Inference)
│   ├── train.py              (Python Model Training)
│   ├── package.json
│   └── model/
│       └── deepfake_detection_model.h5
│
└── cyberSentinel-extension/ (Chrome Extension)
    ├── manifest.json
    ├── content-script.js     (Frame Capture Logic)
    └── frontend/             (React Popup App)
        ├── src/
        ├── dist/
        └── package.json
🚀 Getting Started
To run this project, you need to set up and run both the backend and the frontend.

Prerequisites
Node.js (v22+)

Python (v3.13+) & pip

Google Chrome

1. Backend Setup (Code/ folder)
First, set up the server that runs your ML model.

Bash

# 1. Navigate to the backend directory
cd Code

# 2. Install Node.js dependencies
npm install
Bash

# 3. Set up the Python environment (using a virtual environment is recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 4. Install Python dependencies
pip install tensorflow opencv-python numpy
Bash

# 5. Train your model (Optional - if you have the dataset)
# Make sure your dataset is at the path specified in train.py
python train.py
# This will create 'model/deepfake_detection_model.h5'

# 6. Run the backend server
node backgroundProcess.js
Your backend is now running and listening on http://localhost:5000.

2. Frontend Setup (cyberSentinel-extension/ folder)
Next, build the React popup and load the extension into Chrome.

Bash

# 1. In a new terminal, navigate to the React app's folder
cd cyberSentinel-extension/frontend

# 2. Install dependencies
npm install

# 3. Build the static files
# This creates the 'frontend/dist' folder for the manifest
npm run build
Now, load the extension into Chrome:

Open Google Chrome and navigate to chrome://extensions.

Turn on "Developer mode" in the top-right corner.

Click the "Load unpacked" button.

Select the entire cyberSentinel-extension folder (the one containing manifest.json).

The CyberSentinel icon will appear in your toolbar.

Open a Microsoft Teams call, and the content script will automatically start running.