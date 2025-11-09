# ===============================================
# DeepFake Detection Model Training (FIXED Version)
# ===============================================

import numpy as np
import os
import cv2
import matplotlib.pyplot as plt
import tensorflow as tf
from tensorflow.keras.applications import Xception  # <--- CHANGED: Using Xception, not MobileNet
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, BatchNormalization, GlobalAveragePooling2D
# Removed l2 regularizer, Dropout is more effective here
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras.optimizers import Adam  # <--- CHANGED: Explicitly import Adam

# ===============================================
# Dataset paths (No changes)
# ===============================================
real = "./real_and_fake_face_detection/real_and_fake_face/training_real/"
fake = "./real_and_fake_face_detection/real_and_fake_face/training_fake/"
dataset_path = "real_and_fake_face_detection/real_and_fake_face"

# ===============================================
# Visualize few samples (optional) (No changes)
# ===============================================
def load_img(path):
    image = cv2.imread(path)
    image = cv2.resize(image, (224, 224)) # <--- CHANGED: Visualize at the correct size
    return image[..., ::-1]

# (Visualization code is fine, but it will now show 224x224 images)
# ... [your visualization code] ...

# ===============================================
# CRITICAL FIX: Add JPEG Compression Augmentation
# ===============================================
# This function mimics real-world compression artifacts.
# It will be applied BEFORE other augmentations.
def apply_compression(x):
    # Input 'x' is a NumPy array with values [0, 255]
    # Cast to uint8 for compression
    x_uint8 = tf.cast(x, tf.uint8)
    # Apply random JPEG quality
    x_compressed = tf.image.random_jpeg_quality(x_uint8, 75, 95)
    # Cast back to float32 for the rest of the generator pipeline
    x_float32 = tf.cast(x_compressed, tf.float32)
    return x_float32

# ===============================================
# Data augmentation (fixed)
# ===============================================
data_with_aug = ImageDataGenerator(
    preprocessing_function=apply_compression, # <--- CHANGED: Added compression
    rescale=1. / 255,                       # <--- IMPORTANT: Rescale happens *after* compression
    rotation_range=15,                      # <--- CHANGED: Reduced geometric augmentation
    width_shift_range=0.1,                  # <--- CHANGED: Reduced
    height_shift_range=0.1,                 # <--- CHANGED: Reduced
    shear_range=0.1,                        # <--- CHANGED: Reduced
    zoom_range=0.1,                         # <--- CHANGED: Reduced
    brightness_range=[0.8, 1.2],
    horizontal_flip=True,
    fill_mode='nearest',
    validation_split=0.2
)

# Target size must match the model (224x224 is standard for Xception)
TARGET_SIZE = (224, 224) # <--- CHANGED: 96x96 is too small
BATCH_SIZE = 32

train = data_with_aug.flow_from_directory(
    dataset_path,
    class_mode="binary",      # <--- This is correct
    target_size=TARGET_SIZE,  # <--- CHANGED
    batch_size=BATCH_SIZE,
    subset="training",
    shuffle=True
)

val = data_with_aug.flow_from_directory(
    dataset_path,
    class_mode="binary",
    target_size=TARGET_SIZE,  # <--- CHANGED
    batch_size=BATCH_SIZE,
    subset="validation",
    shuffle=False
)

# ===============================================
# Handle possible class imbalance (No changes)
# ===============================================
labels = train.classes
classes = np.unique(labels)
class_weights = compute_class_weight('balanced', classes=classes, y=labels)
class_weight_dict = dict(enumerate(class_weights))
print("⚖️ Class Weights:", class_weight_dict)

# ===============================================
# Base model (CHANGED to Xception)
# ===============================================
tf.keras.backend.clear_session()

base_model = Xception(
    include_top=False, 
    weights="imagenet", 
    input_shape=(TARGET_SIZE[0], TARGET_SIZE[1], 3) # <--- CHANGED
)

# --- STAGE 1: HEAD TRAINING ---
# Freeze the entire base model. We will only train the new layers.
base_model.trainable = False # <--- CHANGED: Freeze the whole model first

# ===============================================
# Classifier head (Simplified and Corrected)
# ===============================================
model = Sequential([
    base_model,
    GlobalAveragePooling2D(),
    BatchNormalization(),  # <--- Good for stabilizing
    Dropout(0.5),          # <--- Critical for regularization
    Dense(1, activation='sigmoid') # <--- CHANGED: 1 output, 'sigmoid' for binary
])

# ===============================================
# Compile (Corrected)
# ===============================================
optimizer = Adam(learning_rate=1e-4) # <--- A good starting rate
model.compile(
    loss="binary_crossentropy", # <--- CHANGED: Correct loss for 'sigmoid'
    optimizer=optimizer, 
    metrics=["accuracy"]
)
model.summary()

# ===============================================
# Callbacks (No changes, this part was good)
# ===============================================
checkpoint = ModelCheckpoint(
    'model/deepfake_detection_model.h5', 
    monitor='val_loss',
    save_best_only=True,
    verbose=1
)

reduce_lr = ReduceLROnPlateau(
    monitor='val_loss',
    factor=0.2, # <--- CHANGED: Reduce more aggressively
    patience=2,
    min_lr=1e-7,
    verbose=1
)

early_stop = EarlyStopping(
    monitor='val_loss',
    patience=5, # <--- CHANGED: Stop a little sooner
    restore_best_weights=True,
    verbose=1
)

callbacks = [checkpoint, reduce_lr, early_stop]

# ===============================================
# Training (Stage 1)
# ===============================================
print("--- STARTING STAGE 1: HEAD TRAINING ---")

history = model.fit(
    train,
    validation_data=val,
    epochs=30,             # Early stopping will find the best epoch
    callbacks=callbacks,
    class_weight=class_weight_dict
)

print("✅ Stage 1 complete. Best model saved to 'model/deepfake_detection_model.h5'")

# ===============================================
# Plot Training Curves (No changes)
# ===============================================
# ... [your plotting code] ...