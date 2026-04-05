import base64
import json
import sys
from collections import defaultdict

import cv2
import numpy as np
from predictor import analyze_image_bgr


def decode_data_url_to_bgr(data_url):
    encoded_part = data_url.split(",", 1)[1] if "," in data_url else data_url
    raw_bytes = base64.b64decode(encoded_part)
    np_buffer = np.frombuffer(raw_bytes, dtype=np.uint8)
    image_bgr = cv2.imdecode(np_buffer, cv2.IMREAD_COLOR)
    return image_bgr


def main():
    input_text = sys.stdin.read()
    if not input_text.strip():
        print(json.dumps({"error": "No input provided"}), flush=True)
        return

    try:
        payload = json.loads(input_text)
        frames = payload.get("frames", [])
        timestamp = payload.get("timestamp")
        if not frames:
            print(json.dumps({"error": "No frames provided"}), flush=True)
            return

        grouped_predictions = defaultdict(list)
        for frame in frames:
            participant_id = frame.get("participantId")
            image_data = frame.get("imageData", "")

            try:
                image_bgr = decode_data_url_to_bgr(image_data)
                if image_bgr is None:
                    raise ValueError("Could not decode image")

                prediction = analyze_image_bgr(image_bgr)
                grouped_predictions[participant_id].append(prediction)
            except Exception as frame_err:
                grouped_predictions[participant_id].append(
                    {
                        "label": "Error",
                        "error": str(frame_err),
                    }
                )

        results = []
        for participant_id, predictions in grouped_predictions.items():
            valid_predictions = [item for item in predictions if item.get("label") != "Error"]
            if not valid_predictions:
                results.append(
                    {
                        "participantId": participant_id,
                        "label": "Error",
                        "error": predictions[0].get("error", "No valid frames"),
                    }
                )
                continue

            avg_real_prob = float(np.mean([item["real_prob"] for item in valid_predictions]))
            avg_fake_prob = 1.0 - avg_real_prob
            avg_confidence = float(np.mean([item["confidence"] for item in valid_predictions]))

            real_votes = sum(1 for item in valid_predictions if item["label"] == "Real")
            fake_votes = sum(1 for item in valid_predictions if item["label"] == "Fake")
            uncertain_votes = sum(
                1 for item in valid_predictions if item["label"] == "Uncertain"
            )

            if real_votes > fake_votes and real_votes >= uncertain_votes:
                final_label = "Real"
            elif fake_votes > real_votes and fake_votes >= uncertain_votes:
                final_label = "Fake"
            else:
                if avg_real_prob >= 0.55:
                    final_label = "Real"
                elif avg_real_prob <= 0.45:
                    final_label = "Fake"
                else:
                    final_label = "Uncertain"

            results.append(
                {
                    "participantId": participant_id,
                    "label": final_label,
                    "real_prob": round(avg_real_prob, 4),
                    "fake_prob": round(avg_fake_prob, 4),
                    "confidence": round(avg_confidence, 4),
                    "used_face_crop": any(
                        item.get("used_face_crop", False) for item in valid_predictions
                    ),
                    "frames_analyzed": len(valid_predictions),
                    "vote_breakdown": {
                        "real": real_votes,
                        "fake": fake_votes,
                        "uncertain": uncertain_votes,
                    },
                }
            )

        print(json.dumps({"timestamp": timestamp, "results": results}), flush=True)
    except Exception as err:
        print(json.dumps({"error": str(err)}), flush=True)


if __name__ == "__main__":
    main()
