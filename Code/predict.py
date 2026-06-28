import base64
import json
import sys
from collections import defaultdict
import cv2
import numpy as np
import os

# --- Model Loading (Happens ONLY ONCE when server starts) ---
from tensorflow.keras.applications.xception import preprocess_input
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
PREFERRED_MODEL_PATH = os.path.join(MODEL_DIR, "deepfake_detection_model_celebdf.h5")
FALLBACK_MODEL_PATH = os.path.join(MODEL_DIR, "deepfake_detection_model.h5")
MODEL_PATH = PREFERRED_MODEL_PATH if os.path.exists(PREFERRED_MODEL_PATH) else FALLBACK_MODEL_PATH

TARGET_SIZE = (224, 224)
REAL_THRESHOLD = 0.52
FAKE_THRESHOLD = 0.48

try:
    print(f"Loading model from {MODEL_PATH}...", file=sys.stderr)
    model = load_model(MODEL_PATH, compile=False)
    print("Model loaded successfully.", file=sys.stderr)
except Exception as e:
    print(f"MODEL LOAD ERROR: {str(e)}", file=sys.stderr)
    raise

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# --- All your predictor functions go here (detect_largest_face, preprocess, predict, analyze_image_bgr) ---
# Paste your existing functions here exactly as they were.

def decode_data_url_to_bgr(data_url):
    encoded_part = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw_bytes = base64.b64decode(encoded_part)
    np_buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    return image_bgr

def main():
    # Signal to Node.js that Python is ready
    print(json.dumps({"status": "ready"}), flush=True)

    # INFINITE LOOP: Keep the process alive and listen for new lines
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            payload = json.loads(line)
            req_id = payload.get("requestId", "unknown")
            frames = payload.get("frames", [])
            timestamp = payload.get("timestamp")

            if not frames:
                print(json.dumps({"requestId": req_id, "error": "No frames provided"}), flush=True)
                continue

            grouped_predictions = defaultdict(list)
            for frame in frames:
                participant_id = frame.get("participantId")
                image_data = frame.get("imageData", "")

                try:
                    image_bgr = decode_data_url_to_bgr(image_data)
                    if image_bgr is None:
                        raise ValueError("Could not decode image")

                    # IMPORTANT: Assuming analyze_image_bgr is defined above
                    prediction = analyze_image_bgr(image_bgr)
                    grouped_predictions[participant_id].append(prediction)
                except Exception as frame_err:
                    grouped_predictions[participant_id].append(
                        {"label": "Error", "error": str(frame_err)}
                    )

            # ... Calculate averages and votes exactly like your previous code ...
            # (I'm omitting the aggregation math for brevity, insert your voting logic here)
            results = [] 
            # ... results.append({...}) ...

            # Send result back to Node.js on a SINGLE LINE, matching the requestId
            print(json.dumps({
                "requestId": req_id, 
                "timestamp": timestamp, 
                "results": results
            }), flush=True)

        except Exception as err:
            # Always ensure you echo the req_id so Node.js can close the request
            print(json.dumps({"requestId": payload.get("requestId", "unknown"), "error": str(err)}), flush=True)

if __name__ == "__main__":
    main()