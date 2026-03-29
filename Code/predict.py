import base64
import json
import sys

import cv2
import numpy as np
from tensorflow.keras.applications.xception import preprocess_input
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array

MODEL_PATH = "model/deepfake_detection_model.h5"
TARGET_SIZE = (224, 224)
REAL_THRESHOLD = 0.50
FAKE_THRESHOLD = 0.35

model = load_model(MODEL_PATH, compile=False)
face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def detect_largest_face(image_bgr):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    if len(faces) == 0:
        return image_bgr

    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    pad = int(0.2 * max(w, h))
    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(image_bgr.shape[1], x + w + pad)
    y2 = min(image_bgr.shape[0], y + h + pad)
    return image_bgr[y1:y2, x1:x2]


def preprocess_image_bgr(image_bgr):
    image = detect_largest_face(image_bgr)
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    image = cv2.resize(image, TARGET_SIZE)
    image = img_to_array(image)
    image = np.expand_dims(image, axis=0)
    image = preprocess_input(image)
    return image


def predict_image_bgr(image_bgr):
    image = preprocess_image_bgr(image_bgr)
    real_prob = float(model.predict(image, verbose=0)[0][0])
    if real_prob >= REAL_THRESHOLD:
        label = "Real"
    elif real_prob <= FAKE_THRESHOLD:
        label = "Fake"
    else:
        label = "Uncertain"
    return label, real_prob


def decode_data_url_to_bgr(data_url):
    encoded_part = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw_bytes = base64.b64decode(encoded_part)
    np_buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    return image_bgr


def main():
    input_text = sys.stdin.read()
    if not input_text.strip():
        print(json.dumps({"error": "No input provided"}), flush=True)
        return

    try:
        payload = json.loads(input_text)
        frames = payload.get("frames", [])
        timestamp = payload.get("timestamp")
        if not frames:
            print(json.dumps({"error": "No frames provided"}), flush=True)
            return

        results = []
        for frame in frames:
            participant_id = frame.get("participantId")
            image_data = frame.get("imageData", "")

            try:
                image_bgr = decode_data_url_to_bgr(image_data)
                if image_bgr is None:
                    raise ValueError("Could not decode image")

                label, real_prob = predict_image_bgr(image_bgr)
                results.append(
                    {
                        "participantId": participant_id,
                        "label": label,
                        "real_prob": round(real_prob, 4),
                    }
                )
            except Exception as frame_err:
                results.append(
                    {
                        "participantId": participant_id,
                        "label": "Error",
                        "error": str(frame_err),
                    }
                )

        print(json.dumps({"timestamp": timestamp, "results": results}), flush=True)
    except Exception as err:
        print(json.dumps({"error": str(err)}), flush=True)


if __name__ == "__main__":
    main()
