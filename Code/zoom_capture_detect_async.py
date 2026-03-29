# zoom_capture_detect_async.py

import pygetwindow as gw
import numpy as np
import cv2
import time
import threading
import queue
from collections import deque
from mss import mss
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array
from tensorflow.keras.applications.xception import preprocess_input

# ======================================================
# GLOBAL CONFIG
# ======================================================
model = load_model('model/deepfake_detection_model.h5')
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Threshold placeholders: tune these on your validation set
REAL_THRESHOLD = 0.65
FAKE_THRESHOLD = 0.35
SMOOTHING_WINDOW = 10

frame_queue = queue.Queue(maxsize=2)
result_queue = queue.Queue(maxsize=1)
prob_history = deque(maxlen=SMOOTHING_WINDOW)
stop_flag = False


# ======================================================
# MODEL INFERENCE
# ======================================================
def preprocess_frame(frame):
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)  # important
    frame = cv2.resize(frame, (224, 224))
    frame = img_to_array(frame)
    frame = np.expand_dims(frame, axis=0)
    frame = preprocess_input(frame)
    return frame



def classify_probability(real_prob):
    if real_prob >= REAL_THRESHOLD:
        return "Real"
    if real_prob <= FAKE_THRESHOLD:
        return "Fake"
    return "Uncertain"


def detect_largest_face(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60)
    )

    if len(faces) == 0:
        return None, None

    x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
    pad = int(0.2 * max(w, h))

    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(frame.shape[1], x + w + pad)
    y2 = min(frame.shape[0], y + h + pad)

    return frame[y1:y2, x1:x2], (x1, y1, x2, y2)


def predict_frame(frame):
    face_crop, face_bbox = detect_largest_face(frame)
    if face_crop is None:
        return "No Face", None, None, None

    processed = preprocess_frame(face_crop)
    real_prob = float(model.predict(processed, verbose=0)[0][0])  # sigmoid probability

    prob_history.append(real_prob)
    smoothed_prob = float(np.mean(prob_history))
    label = classify_probability(smoothed_prob)
    return label, real_prob, smoothed_prob, face_bbox


# ======================================================
# WINDOW DETECTION (Zoom/Teams)
# ======================================================
def get_meeting_window():
    for w in gw.getWindowsWithTitle(''):
        title = w.title.lower()
        if "zoom meeting" in title or "microsoft teams" in title:
            print(f"Found meeting window: {w.title}")
            return {
                'top': w.top,
                'left': w.left,
                'width': w.width,
                'height': w.height
            }
    print("No Zoom/Teams window found. Make sure the meeting is open.")
    return None


# ======================================================
# THREAD 1: FRAME CAPTURE
# ======================================================
def capture_frames(bbox):
    global stop_flag
    sct = mss()
    while not stop_flag:
        sct_img = sct.grab(bbox)
        frame = np.array(sct_img)
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
        if not frame_queue.full():
            frame_queue.put(frame)
        time.sleep(0.05)  # ~20 FPS


# ======================================================
# THREAD 2: MODEL INFERENCE
# ======================================================
def inference_loop():
    global stop_flag
    while not stop_flag:
        if not frame_queue.empty():
            frame = frame_queue.get()
            label, raw_score, smooth_score, face_bbox = predict_frame(frame)
            if not result_queue.full():
                result_queue.put((frame, label, raw_score, smooth_score, face_bbox))


# ======================================================
# START AND STOP CONTROL
# ======================================================
def start_zoom_detection():
    """Initialize threads for capturing and inference."""
    global stop_flag

    prob_history.clear()
    bbox = get_meeting_window()
    if not bbox:
        print("No meeting window detected.")
        return None

    print(f"Capturing region: {bbox}")
    stop_flag = False

    t1 = threading.Thread(target=capture_frames, args=(bbox,))
    t2 = threading.Thread(target=inference_loop)
    t1.start()
    t2.start()

    return t1, t2


def stop_zoom_detection(threads):
    """Stop all threads gracefully."""
    global stop_flag
    stop_flag = True
    for t in threads:
        t.join()
    cv2.destroyAllWindows()
    print("Detection stopped.")


# ======================================================
# UTILITY: GET LATEST FRAME + RESULT
# ======================================================
def get_latest_result():
    """Return the latest frame and label if available."""
    if not result_queue.empty():
        frame, label, raw_score, smooth_score, face_bbox = result_queue.get()

        if label == "Real":
            color = (0, 255, 0)
        elif label == "Fake":
            color = (0, 0, 255)
        else:
            color = (0, 255, 255)

        if face_bbox is not None:
            x1, y1, x2, y2 = face_bbox
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        cv2.putText(frame, f"Status: {label}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

        if raw_score is not None:
            cv2.putText(frame, f"Real prob (raw): {raw_score:.3f}", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
            cv2.putText(frame, f"Real prob (smooth): {smooth_score:.3f}", (20, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
        else:
            cv2.putText(frame, "No face detected", (20, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

        return frame, label

    return None, None
