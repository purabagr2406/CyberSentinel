import time

import cv2
import numpy as np
import streamlit as st
from tensorflow.keras.applications.xception import preprocess_input
from tensorflow.keras.models import load_model

from zoom_capture_detect_async import (
    get_latest_result,
    start_zoom_detection,
    stop_zoom_detection,
)

model = load_model("model/deepfake_detection_model.h5")
face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

TARGET_SIZE = (224, 224)
REAL_THRESHOLD = 0.65
FAKE_THRESHOLD = 0.35


def preprocess_image(image):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray, scaleFactor=1.1, minNeighbors=5, minSize=(60, 60)
    )
    if len(faces):
        x, y, w, h = max(faces, key=lambda b: b[2] * b[3])
        pad = int(0.2 * max(w, h))
        x1 = max(0, x - pad)
        y1 = max(0, y - pad)
        x2 = min(image.shape[1], x + w + pad)
        y2 = min(image.shape[0], y + h + pad)
        image = image[y1:y2, x1:x2]

    resized_image = cv2.resize(image, TARGET_SIZE)
    rgb_image = cv2.cvtColor(resized_image, cv2.COLOR_BGR2RGB)
    image = np.expand_dims(rgb_image.astype("float32"), axis=0)
    return preprocess_input(image)


def predict_image(image):
    processed_image = preprocess_image(image)
    real_prob = float(model.predict(processed_image, verbose=0)[0][0])
    if real_prob >= REAL_THRESHOLD:
        return "Real", real_prob
    if real_prob <= FAKE_THRESHOLD:
        return "Fake", real_prob
    return "Uncertain", real_prob


st.set_page_config(page_title="Deepfake Detection", layout="wide")

if "threads" not in st.session_state:
    st.session_state["threads"] = None
if "live_running" not in st.session_state:
    st.session_state["live_running"] = False

st.title("Deepfake Detection Dashboard")
mode = st.sidebar.radio("Choose Mode", ["Upload Image", "Zoom/Teams Live Detection"])


if mode == "Upload Image":
    uploaded_file = st.file_uploader(
        "Upload an image for deepfake detection", type=["jpg", "jpeg", "png"]
    )
    if uploaded_file:
        file_bytes = np.asarray(bytearray(uploaded_file.read()), dtype=np.uint8)
        image = cv2.imdecode(file_bytes, 1)
        st.image(image, channels="BGR", caption="Uploaded Image", use_container_width=True)

        result, real_prob = predict_image(image)
        color = "green" if result == "Real" else ("orange" if result == "Uncertain" else "red")
        st.markdown(
            f"<h2 style='color:{color};text-align:center;'>The image is {result}</h2>"
            f"<p style='text-align:center;'>Real probability: {real_prob:.3f}</p>",
            unsafe_allow_html=True,
        )

elif mode == "Zoom/Teams Live Detection":
    st.info("Keep Zoom or Teams visible and not minimized.")

    start_btn = st.button("Start Live Detection")
    stop_btn = st.button("Stop Detection")

    if start_btn and not st.session_state["live_running"]:
        threads = start_zoom_detection()
        if threads is None:
            st.error("Could not start detection. Open a Zoom or Teams window.")
        else:
            st.session_state["threads"] = threads
            st.session_state["live_running"] = True
            st.success("Detection started.")

    if stop_btn and st.session_state["live_running"]:
        stop_zoom_detection(st.session_state["threads"])
        st.session_state["threads"] = None
        st.session_state["live_running"] = False
        st.success("Detection stopped.")

    if st.session_state["live_running"]:
        frame, label = get_latest_result()
        if frame is not None:
            st.image(frame, channels="BGR", use_container_width=True)
            color = "green" if label == "Real" else ("orange" if label == "Uncertain" else "red")
            st.markdown(
                f"<h3 style='text-align:center;color:{color};'>Frame classified as {label}</h3>",
                unsafe_allow_html=True,
            )
        time.sleep(0.1)
        st.rerun()
