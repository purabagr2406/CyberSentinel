import argparse
import os

import numpy as np
import tensorflow as tf
from sklearn.utils.class_weight import compute_class_weight
from tensorflow.keras.applications import Xception
from tensorflow.keras.applications.xception import preprocess_input
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from tensorflow.keras.layers import BatchNormalization, Dense, Dropout, GlobalAveragePooling2D
from tensorflow.keras.metrics import AUC, BinaryAccuracy
from tensorflow.keras.models import Sequential
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.preprocessing.image import ImageDataGenerator


TARGET_SIZE = (224, 224)
BATCH_SIZE = 16


def parse_args():
    parser = argparse.ArgumentParser(
        description="Train the deepfake detector on a prepared image dataset."
    )
    parser.add_argument(
        "--dataset-root",
        default="real_and_fake_face_detection/real_and_fake_face",
        help=(
            "Dataset root. Supports either legacy layout with 'training_fake' / "
            "'training_real' or split layout with train/val subfolders."
        ),
    )
    parser.add_argument(
        "--output-model",
        default="model/deepfake_detection_model.h5",
        help="Where to save the best model.",
    )
    parser.add_argument(
        "--epochs-stage1",
        type=int,
        default=10,
        help="Epochs for training the classifier head.",
    )
    parser.add_argument(
        "--epochs-stage2",
        type=int,
        default=10,
        help="Epochs for fine-tuning the backbone.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=BATCH_SIZE,
        help="Batch size for training and validation.",
    )
    return parser.parse_args()


def has_explicit_splits(dataset_root):
    train_dir = os.path.join(dataset_root, "train")
    val_dir = os.path.join(dataset_root, "val")
    return os.path.isdir(train_dir) and os.path.isdir(val_dir)


def build_generators(dataset_root, batch_size):
    train_datagen = ImageDataGenerator(
        preprocessing_function=preprocess_input,
        rotation_range=12,
        width_shift_range=0.08,
        height_shift_range=0.08,
        zoom_range=0.08,
        brightness_range=[0.85, 1.15],
        horizontal_flip=True,
    )
    val_datagen = ImageDataGenerator(preprocessing_function=preprocess_input)

    if has_explicit_splits(dataset_root):
        train_dir = os.path.join(dataset_root, "train")
        val_dir = os.path.join(dataset_root, "val")

        train_gen = train_datagen.flow_from_directory(
            train_dir,
            target_size=TARGET_SIZE,
            batch_size=batch_size,
            class_mode="binary",
            shuffle=True,
        )
        val_gen = val_datagen.flow_from_directory(
            val_dir,
            target_size=TARGET_SIZE,
            batch_size=batch_size,
            class_mode="binary",
            shuffle=False,
        )
        return train_gen, val_gen

    legacy_datagen = ImageDataGenerator(
        preprocessing_function=preprocess_input,
        rotation_range=12,
        width_shift_range=0.08,
        height_shift_range=0.08,
        zoom_range=0.08,
        brightness_range=[0.85, 1.15],
        horizontal_flip=True,
        validation_split=0.2,
    )

    train_gen = legacy_datagen.flow_from_directory(
        dataset_root,
        target_size=TARGET_SIZE,
        batch_size=batch_size,
        class_mode="binary",
        subset="training",
        shuffle=True,
    )
    val_gen = legacy_datagen.flow_from_directory(
        dataset_root,
        target_size=TARGET_SIZE,
        batch_size=batch_size,
        class_mode="binary",
        subset="validation",
        shuffle=False,
    )
    return train_gen, val_gen


def build_model():
    tf.keras.backend.clear_session()

    base_model = Xception(
        include_top=False,
        weights="imagenet",
        input_shape=(TARGET_SIZE[0], TARGET_SIZE[1], 3),
    )
    base_model.trainable = False

    model = Sequential(
        [
            base_model,
            GlobalAveragePooling2D(),
            BatchNormalization(),
            Dropout(0.5),
            Dense(128, activation="relu"),
            Dropout(0.4),
            Dense(1, activation="sigmoid"),
        ]
    )
    return model, base_model


def compile_model(model, learning_rate):
    model.compile(
        optimizer=Adam(learning_rate),
        loss="binary_crossentropy",
        metrics=[BinaryAccuracy(name="accuracy"), AUC(name="auc")],
    )


def compute_class_weights(train_gen):
    labels = train_gen.classes
    classes = np.unique(labels)
    weights = compute_class_weight("balanced", classes=classes, y=labels)
    return dict(enumerate(weights))


def ensure_parent_dir(path):
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)


def main():
    args = parse_args()

    train_gen, val_gen = build_generators(args.dataset_root, args.batch_size)
    class_weight_dict = compute_class_weights(train_gen)

    print("Class mapping:", train_gen.class_indices)
    print("Class weights:", class_weight_dict)
    print("Training samples:", train_gen.samples)
    print("Validation samples:", val_gen.samples)

    model, base_model = build_model()
    ensure_parent_dir(args.output_model)

    callbacks = [
        ModelCheckpoint(
            args.output_model,
            monitor="val_auc",
            mode="max",
            save_best_only=True,
            verbose=1,
        ),
        ReduceLROnPlateau(
            monitor="val_auc",
            mode="max",
            factor=0.3,
            patience=2,
            min_lr=1e-7,
            verbose=1,
        ),
        EarlyStopping(
            monitor="val_auc",
            mode="max",
            patience=4,
            restore_best_weights=True,
            verbose=1,
        ),
    ]

    print("\n--- STAGE 1: TRAIN HEAD ---")
    compile_model(model, learning_rate=1e-4)
    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=args.epochs_stage1,
        callbacks=callbacks,
        class_weight=class_weight_dict,
    )

    print("\n--- STAGE 2: FINE TUNE ---")
    for layer in base_model.layers[-40:]:
        layer.trainable = True

    compile_model(model, learning_rate=1e-5)
    model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=args.epochs_stage2,
        callbacks=callbacks,
        class_weight=class_weight_dict,
    )

    print(f"\nTraining complete. Best model saved to: {args.output_model}")


if __name__ == "__main__":
    main()
