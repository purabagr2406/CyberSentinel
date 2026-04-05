import argparse
import os

import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix
from tensorflow.keras.applications.xception import preprocess_input
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing.image import ImageDataGenerator


TARGET_SIZE = (224, 224)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Evaluate a trained model on the Celeb-DF test split."
    )
    parser.add_argument(
        "--dataset-root",
        required=True,
        help="Prepared dataset root containing test/real and test/fake.",
    )
    parser.add_argument(
        "--model-path",
        default="model/deepfake_detection_model.h5",
        help="Path to the trained .h5 model.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for evaluation.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
        help="Threshold for predicting the real class.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    test_dir = os.path.join(args.dataset_root, "test")
    if not os.path.isdir(test_dir):
        raise ValueError(f"Test split not found: {test_dir}")

    datagen = ImageDataGenerator(preprocessing_function=preprocess_input)
    test_gen = datagen.flow_from_directory(
        test_dir,
        target_size=TARGET_SIZE,
        batch_size=args.batch_size,
        class_mode="binary",
        shuffle=False,
    )

    model = load_model(args.model_path, compile=False)
    probabilities = model.predict(test_gen, verbose=1).ravel()
    predictions = (probabilities >= args.threshold).astype(int)
    labels = test_gen.classes

    loss = tf.keras.losses.binary_crossentropy(labels.astype(np.float32), probabilities)
    avg_loss = float(np.mean(loss))
    accuracy = float(np.mean(predictions == labels))

    print("\nClass mapping:", test_gen.class_indices)
    print(f"Samples: {test_gen.samples}")
    print(f"Threshold: {args.threshold:.2f}")
    print(f"Average binary crossentropy: {avg_loss:.4f}")
    print(f"Accuracy: {accuracy:.4f}")
    print("\nConfusion matrix:")
    print(confusion_matrix(labels, predictions))
    print("\nClassification report:")
    print(
        classification_report(
            labels,
            predictions,
            target_names=list(test_gen.class_indices.keys()),
            digits=4,
        )
    )

    real_mask = labels == 1
    fake_mask = labels == 0
    if np.any(real_mask):
        print(f"Average real probability for real images: {float(np.mean(probabilities[real_mask])):.4f}")
    if np.any(fake_mask):
        print(f"Average real probability for fake images: {float(np.mean(probabilities[fake_mask])):.4f}")


if __name__ == "__main__":
    main()
