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
POSITIVE_CLASS_LABEL = "Real"
NEGATIVE_CLASS_LABEL = "Fake"

try:
    print(f"Loading model from {MODEL_PATH}...", file=sys.stderr)
    model = load_model(MODEL_PATH, compile=False)
    print("Model loaded successfully.", file=sys.stderr)
except Exception as e:
    print(f"MODEL LOAD ERROR: {str(e)}", file=sys.stderr)
    raise

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

# --- Predictor Functions ---

def detect_largest_face_with_bbox(image_bgr):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    if len(faces) == 0:
        return None, None

    x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
    pad = int(0.2 * max(w, h))

    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(image_bgr.shape[1], x + w + pad)
    y2 = min(image_bgr.shape[0], y + h + pad)

    return image_bgr[y1:y2, x1:x2], (x1, y1, x2, y2)

def preprocess_image_bgr(image_bgr):
    rgb_image = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    resized_image = cv2.resize(rgb_image, TARGET_SIZE)
    image_array = img_to_array(resized_image)
    image_array = np.expand_dims(image_array, axis=0)
    return preprocess_input(image_array)

def predict_real_probability(image_bgr):
    processed_image = preprocess_image_bgr(image_bgr)
    pred = model.predict(processed_image, verbose=0)[0][0]
    return float(pred)

def classify_real_probability(real_prob):
    if real_prob >= REAL_THRESHOLD:
        return POSITIVE_CLASS_LABEL
    if real_prob <= FAKE_THRESHOLD:
        return NEGATIVE_CLASS_LABEL
    return "Uncertain"

def analyze_image_bgr(image_bgr):
    if image_bgr is None or image_bgr.size == 0:
        raise ValueError("Invalid image")

    face_crop, _ = detect_largest_face_with_bbox(image_bgr)
    used_face_crop = face_crop is not None

    image_to_analyze = face_crop if used_face_crop else image_bgr
    real_prob = predict_real_probability(image_to_analyze)

    fake_prob = 1.0 - real_prob
    label = classify_real_probability(real_prob)
    confidence = abs(real_prob - 0.5) * 2.0

    return {
        "label": label,
        "real_prob": float(real_prob),
        "fake_prob": float(fake_prob),
        "confidence": float(confidence),
        "used_face_crop": used_face_crop,
    }

def decode_data_url_to_bgr(data_url):
    encoded_part = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw_bytes = base64.b64decode(encoded_part)
    np_buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    return image_bgr

# --- Main Background Worker Loop ---

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

            # 1. Gather all predictions per participant
            grouped_predictions = defaultdict(list)
            for frame in frames:
                participant_id = frame.get("participantId")
                image_data = frame.get("imageData", "")

                try:
                    image_bgr = decode_data_url_to_bgr(image_data)
                    if image_bgr is None:
                        raise ValueError("Could not decode image")

                    prediction = analyze_image_bgr(image_bgr)
                    grouped_predictions[participant_id].append(prediction)
                except Exception as frame_err:
                    grouped_predictions[participant_id].append(
                        {"label": "Error", "error": str(frame_err)}
                    )

            # 2. Aggregate votes and probabilities
            results = []
            for participant_id, predictions in grouped_predictions.items():
                valid_predictions = [item for item in predictions if item.get("label") != "Error"]
                
                if not valid_predictions:
                    results.append({
                        "participantId": participant_id,
                        "label": "Error",
                        "error": predictions[0].get("error", "No valid frames")
                    })
                    continue

                avg_real_prob = float(np.mean([item["real_prob"] for item in valid_predictions]))
                avg_fake_prob = 1.0 - avg_real_prob
                avg_confidence = float(np.mean([item["confidence"] for item in valid_predictions]))

                real_votes = sum(1 for item in valid_predictions if item["label"] == "Real")
                fake_votes = sum(1 for item in valid_predictions if item["label"] == "Fake")
                uncertain_votes = sum(1 for item in valid_predictions if item["label"] == "Uncertain")

                # Determine final label based on majority vote, fallback to average probability
                if real_votes > fake_votes and real_votes >= uncertain_votes:
                    final_label = "Real"
                elif fake_votes > real_votes and fake_votes >= uncertain_votes:
                    final_label = "Fake"
                else:
                    if avg_real_prob >= 0.55:
                        final_label = "Real"
                    elif avg_real_prob <= 0.45:
                        final_label = "Fake"
                    else:
                        final_label = "Uncertain"

                results.append({
                    "participantId": participant_id,
                    "label": final_label,
                    "real_prob": round(avg_real_prob, 4),
                    "fake_prob": round(avg_fake_prob, 4),
                    "confidence": round(avg_confidence, 4),
                    "used_face_crop": any(item.get("used_face_crop", False) for item in valid_predictions),
                    "frames_analyzed": len(valid_predictions),
                    "vote_breakdown": {
                        "real": real_votes,
                        "fake": fake_votes,
                        "uncertain": uncertain_votes,
                    },
                })

            # 3. Send result back to Node.js on a SINGLE LINE, matching the requestId
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