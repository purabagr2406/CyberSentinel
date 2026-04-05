import argparse
import os
import random

import cv2


VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv"}


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract face crops from Celeb-DF videos into train/val/test folders."
    )
    parser.add_argument(
        "--celeb-root",
        required=True,
        help="Root folder of the unpacked Celeb-DF dataset.",
    )
    parser.add_argument(
        "--output-root",
        default="celebdf_faces",
        help="Output folder for extracted face images.",
    )
    parser.add_argument(
        "--frames-per-video",
        type=int,
        default=8,
        help="How many frames to sample from each video.",
    )
    parser.add_argument(
        "--min-face-size",
        type=int,
        default=80,
        help="Minimum face size passed to Haar detection.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducible splits.",
    )
    return parser.parse_args()


def find_videos(root_dir):
    videos = []
    for current_root, _, filenames in os.walk(root_dir):
        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            if ext in VIDEO_EXTENSIONS:
                videos.append(os.path.join(current_root, filename))
    videos.sort()
    return videos


def collect_celebdf_videos(celeb_root):
    buckets = {
        "real": [],
        "fake": [],
    }

    folder_map = {
        "real": ["Celeb-real", "YouTube-real"],
        "fake": ["Celeb-synthesis"],
    }

    for label, folders in folder_map.items():
        for folder in folders:
            folder_path = os.path.join(celeb_root, folder)
            if os.path.isdir(folder_path):
                buckets[label].extend(find_videos(folder_path))

    return buckets


def split_items(items, seed):
    shuffled = list(items)
    random.Random(seed).shuffle(shuffled)

    total = len(shuffled)
    train_end = int(total * 0.8)
    val_end = int(total * 0.9)

    return {
        "train": shuffled[:train_end],
        "val": shuffled[train_end:val_end],
        "test": shuffled[val_end:],
    }


def evenly_spaced_indices(frame_count, sample_count):
    if frame_count <= 0:
        return []
    if frame_count <= sample_count:
        return list(range(frame_count))

    step = frame_count / float(sample_count)
    return [min(int(i * step), frame_count - 1) for i in range(sample_count)]


def extract_largest_face(frame_bgr, face_cascade, min_face_size):
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(min_face_size, min_face_size),
    )

    if len(faces) == 0:
        return None

    x, y, w, h = max(faces, key=lambda box: box[2] * box[3])
    pad = int(0.2 * max(w, h))

    x1 = max(0, x - pad)
    y1 = max(0, y - pad)
    x2 = min(frame_bgr.shape[1], x + w + pad)
    y2 = min(frame_bgr.shape[0], y + h + pad)
    return frame_bgr[y1:y2, x1:x2]


def ensure_split_dirs(output_root):
    for split_name in ("train", "val", "test"):
        for label in ("real", "fake"):
            os.makedirs(os.path.join(output_root, split_name, label), exist_ok=True)


def save_faces_from_video(
    video_path,
    split_name,
    label,
    output_root,
    frames_per_video,
    min_face_size,
    face_cascade,
):
    capture = cv2.VideoCapture(video_path)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    sample_indices = evenly_spaced_indices(frame_count, frames_per_video)

    if not sample_indices:
        capture.release()
        return 0

    base_name = os.path.splitext(os.path.basename(video_path))[0]
    saved = 0

    for sample_idx, frame_index in enumerate(sample_indices):
        capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        ok, frame = capture.read()
        if not ok or frame is None:
            continue

        face_crop = extract_largest_face(frame, face_cascade, min_face_size)
        if face_crop is None or face_crop.size == 0:
            continue

        save_path = os.path.join(
            output_root,
            split_name,
            label,
            f"{base_name}_frame{frame_index:05d}_{sample_idx:02d}.jpg",
        )
        cv2.imwrite(save_path, face_crop)
        saved += 1

    capture.release()
    return saved


def main():
    args = parse_args()
    ensure_split_dirs(args.output_root)

    buckets = collect_celebdf_videos(args.celeb_root)
    if not buckets["real"] or not buckets["fake"]:
        raise ValueError(
            "Could not find Celeb-DF videos. Expected folders like "
            "'Celeb-real', 'YouTube-real', and 'Celeb-synthesis'."
        )

    face_cascade = cv2.CascadeClassifier(
        cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )

    split_map = {
        "real": split_items(buckets["real"], args.seed),
        "fake": split_items(buckets["fake"], args.seed),
    }

    totals = {
        "train": {"real": 0, "fake": 0},
        "val": {"real": 0, "fake": 0},
        "test": {"real": 0, "fake": 0},
    }

    for label, split_groups in split_map.items():
        for split_name, videos in split_groups.items():
            print(f"{label} {split_name}: {len(videos)} videos")
            for index, video_path in enumerate(videos, start=1):
                saved = save_faces_from_video(
                    video_path=video_path,
                    split_name=split_name,
                    label=label,
                    output_root=args.output_root,
                    frames_per_video=args.frames_per_video,
                    min_face_size=args.min_face_size,
                    face_cascade=face_cascade,
                )
                totals[split_name][label] += saved
                if index % 25 == 0 or index == len(videos):
                    print(
                        f"  processed {index}/{len(videos)} videos for {label} {split_name} "
                        f"| saved faces: {totals[split_name][label]}"
                    )

    print("\nExtraction complete.")
    for split_name in ("train", "val", "test"):
        print(
            f"{split_name}: real={totals[split_name]['real']} "
            f"fake={totals[split_name]['fake']}"
        )


if __name__ == "__main__":
    main()
