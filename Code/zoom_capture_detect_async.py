# zoom_capture_detect_async.py

import pygetwindow as gw
import numpy as np
import cv2
import time
import threading
import queue
from mss import mss
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array

# ======================================================
# GLOBAL CONFIG
# ======================================================
model = load_model('model/deepfake_detection_model.h5')

frame_queue = queue.Queue(maxsize=2)
result_queue = queue.Queue(maxsize=1)
stop_flag = False


# ======================================================
# MODEL INFERENCE
# ======================================================
def preprocess_frame(frame):
    frame = cv2.resize(frame, (96, 96))
    frame = img_to_array(frame)
    frame = np.expand_dims(frame, axis=0)
    frame = frame / 255.0
    return frame


def predict_frame(frame):
    processed = preprocess_frame(frame)
    pred = model.predict(processed)
    label = np.argmax(pred, axis=1)[0]
    return "Fake" if label == 0 else "Real"


# ======================================================
# WINDOW DETECTION (Zoom/Teams)
# ======================================================
def get_meeting_window():
    for w in gw.getWindowsWithTitle(''):
        title = w.title.lower()
        if "zoom meeting" in title or "microsoft teams" in title:
            print(f"✅ Found meeting window: {w.title}")
            return {
                'top': w.top,
                'left': w.left,
                'width': w.width,
                'height': w.height
            }
    print("❌ No Zoom/Teams window found. Make sure the meeting is open.")
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
            label = predict_frame(frame)
            if not result_queue.full():
                result_queue.put((frame, label))


# ======================================================
# START AND STOP CONTROL
# ======================================================
def start_zoom_detection():
    """Initialize threads for capturing and inference."""
    global stop_flag
    bbox = get_meeting_window()
    if not bbox:
        print("❌ No meeting window detected.")
        return None

    print(f"📷 Capturing region: {bbox}")
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
    print("✅ Detection stopped.")


# ======================================================
# UTILITY: GET LATEST FRAME + RESULT
# ======================================================
def get_latest_result():
    """Return the latest frame and label if available."""
    if not result_queue.empty():
        frame, label = result_queue.get()
        color = (0, 255, 0) if label == "Real" else (0, 0, 255)
        cv2.putText(frame, f"Status: {label}", (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)
        return frame, label
    return None, None
