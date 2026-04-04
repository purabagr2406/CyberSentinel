import time

import cv2
import numpy as np
import streamlit as st

from predictor import analyze_image_bgr
from zoom_capture_detect_async import (
    get_latest_result,
    start_zoom_detection,
    stop_zoom_detection,
)


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

        prediction = analyze_image_bgr(image)
        result = prediction["label"]
        real_prob = prediction["real_prob"]
        color = "green" if result == "Real" else ("orange" if result == "Uncertain" else "red")
        st.markdown(
            f"<h2 style='color:{color};text-align:center;'>The image is {result}</h2>"
            f"<p style='text-align:center;'>Real probability: {real_prob:.3f}</p>"
            f"<p style='text-align:center;'>Confidence: {prediction['confidence']:.3f}</p>"
            f"<p style='text-align:center;'>Used face crop assist: {'Yes' if prediction['used_face_crop'] else 'No'}</p>",
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
