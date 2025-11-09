# app.py

import streamlit as st
import numpy as np
import cv2
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import img_to_array
import time
from zoom_capture_detect_async import (
    start_zoom_detection,
    stop_zoom_detection,
    get_latest_result
)

# ======================================================
# LOAD MODEL
# ======================================================
model = load_model('model/deepfake_detection_model.h5')


TARGET_SIZE = (224, 224)
def preprocess_image(image):
    # 1. Resize the image (224x224)
    resized_image = cv2.resize(image, TARGET_SIZE)
    
    # *CRITICAL STEP: Convert BGR to RGB* # cv2 loads BGR, but your pre-trained Xception model expects RGB.
    rgb_image = cv2.cvtColor(resized_image, cv2.COLOR_BGR2RGB) # <--- Recommended Fix

    # 2. Normalize the pixel values from [0, 255] to [0.0, 1.0]
    normalized_image = rgb_image.astype("float32") / 255.0
    
    # 3. Add the batch dimension (1, 224, 224, 3)
    image = np.expand_dims(normalized_image, axis=0)
    
    return image

def predict_image(image):
    processed_image = preprocess_image(image)
    prediction = model.predict(processed_image)
    class_label = np.argmax(prediction, axis=1)[0]
    return "Fake" if class_label == 0 else "Real"


# ======================================================
# STREAMLIT INTERFACE
# ======================================================
st.set_page_config(page_title="Deepfake Detection", layout="wide")

st.markdown("<h1 style='text-align:center;color:grey;'>🧠 Deepfake Detection Dashboard</h1>", unsafe_allow_html=True)

mode = st.sidebar.radio("Choose Mode", ["📸 Upload Image", "🎥 Zoom/Teams Live Detection"])

# ------------------------------------------------------
# MODE 1: IMAGE UPLOAD
# ------------------------------------------------------
if mode == "📸 Upload Image":
    uploaded_file = st.file_uploader("Upload an image for deepfake detection", type=["jpg", "jpeg", "png"])
    if uploaded_file:
        file_bytes = np.asarray(bytearray(uploaded_file.read()), dtype=np.uint8)
        image = cv2.imdecode(file_bytes, 1)
        st.image(image, channels="BGR", caption="Uploaded Image", use_container_width=True)

        result = predict_image(image)
        color = "green" if result == "Real" else "red"

        st.markdown(f"<h2 style='color:{color};text-align:center;'>The image is {result}</h2>", unsafe_allow_html=True)


# ------------------------------------------------------
# MODE 2: LIVE ZOOM/TEAMS DETECTION
# ------------------------------------------------------
elif mode == "🎥 Zoom/Teams Live Detection":
    st.info("Make sure your Zoom or Microsoft Teams meeting window is visible on screen (not minimized).")

    start_btn = st.button("Start Live Detection")
    stop_btn = st.button("Stop Detection")

    if start_btn:
        st.session_state['threads'] = start_zoom_detection()
        if st.session_state['threads'] is None:
            st.error("❌ Could not start detection. Please open a Zoom or Teams window.")
        else:
            st.success("✅ Detection started successfully.")
            frame_placeholder = st.empty()
            label_placeholder = st.empty()

            while True:
                frame, label = get_latest_result()
                if frame is not None:
                    frame_placeholder.image(frame, channels="BGR", use_container_width=True)
                    label_placeholder.markdown(f"<h3 style='text-align:center;color:{'green' if label=='Real' else 'red'};'>Frame classified as {label}</h3>", unsafe_allow_html=True)
                time.sleep(0.1)
                if stop_btn:
                    stop_zoom_detection(st.session_state['threads'])
                    st.success("✅ Detection stopped.")
                    break