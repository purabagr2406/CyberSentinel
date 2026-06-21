import argparse
import os

import cv2

from predictor import predict_real_probability


def iter_images(folder_path):
    for name in os.listdir(folder_path):
        if name.lower().endswith((".jpg", ".jpeg", ".png")):
            yield os.path.join(folder_path, name)


def evaluate_folder(folder_path, expected_label, threshold):
    total = 0
    correct = 0
    probs = []

    for image_path in iter_images(folder_path):
        image = cv2.imread(image_path)
        if image is None:
            continue

        real_prob = predict_real_probability(image)
        predicted_label = "Real" if real_prob >= threshold else "Fake"

        total += 1
        probs.append(real_prob)
        if predicted_label == expected_label:
            correct += 1

    avg_prob = sum(probs) / len(probs) if probs else 0.0
    accuracy = (correct / total) if total else 0.0
    return total, correct, accuracy, avg_prob


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--dataset",
        default="real_and_fake_face_detection/real_and_fake_face",
        help="Parent directory containing training_fake and training_real",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.5,
        help="Decision threshold for classifying Real vs Fake",
    )
    args = parser.parse_args()

    fake_dir = os.path.join(args.dataset, "training_fake")
    real_dir = os.path.join(args.dataset, "training_real")

    fake_total, fake_correct, fake_acc, fake_avg = evaluate_folder(
        fake_dir, "Fake", args.threshold
    )
    real_total, real_correct, real_acc, real_avg = evaluate_folder(
        real_dir, "Real", args.threshold
    )

    overall_total = fake_total + real_total
    overall_correct = fake_correct + real_correct
    overall_acc = (overall_correct / overall_total) if overall_total else 0.0

    print(f"Threshold: {args.threshold:.2f}")
    print(
        f"Fake folder: {fake_correct}/{fake_total} correct | "
        f"accuracy={fake_acc:.4f} | avg_real_prob={fake_avg:.4f}"
    )
    print(
        f"Real folder: {real_correct}/{real_total} correct | "
        f"accuracy={real_acc:.4f} | avg_real_prob={real_avg:.4f}"
    )
    print(f"Overall accuracy: {overall_correct}/{overall_total} = {overall_acc:.4f}")


if __name__ == "__main__":
    main()
