import os
import sys

import cv2
import numpy as np
from tensorflow.keras.applications.xception import preprocess_input
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")
PREFERRED_MODEL_PATH = os.path.join(MODEL_DIR, "deepfake_detection_model_celebdf.h5")
FALLBACK_MODEL_PATH = os.path.join(MODEL_DIR, "deepfake_detection_model.h5")
MODEL_PATH = (
    PREFERRED_MODEL_PATH if os.path.exists(PREFERRED_MODEL_PATH) else FALLBACK_MODEL_PATH
)

TARGET_SIZE = (224, 224)

REAL_THRESHOLD = 0.52
FAKE_THRESHOLD = 0.48

POSITIVE_CLASS_LABEL = "Real"
NEGATIVE_CLASS_LABEL = "Fake"


try:
    model = load_model(MODEL_PATH, compile=False)
except Exception as e:
    print(f"MODEL LOAD ERROR: {str(e)}", file=sys.stderr)
    raise


face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)


def detect_largest_face_with_bbox(image_bgr):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60),
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

    # 1. Detect the face FIRST
    face_crop, _ = detect_largest_face_with_bbox(image_bgr)
    used_face_crop = face_crop is not None

    # 2. Use the face crop for prediction if we found one. 
    # If no face is found, fallback to analyzing the whole frame.
    image_to_analyze = face_crop if used_face_crop else image_bgr
    
    # 3. Predict on the correct image
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
