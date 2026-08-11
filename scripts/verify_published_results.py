from __future__ import annotations

import json
import math
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "demo" / "data" / "scene.json"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"PUBLIC RESULT VERIFICATION FAILED\n- {message}")


def close(actual: float, expected: float, name: str, tolerance: float = 1e-9) -> None:
    require(math.isclose(actual, expected, rel_tol=tolerance, abs_tol=tolerance), f"{name}: expected {expected}, got {actual}")


def nearest_neighbour_accuracy(condition: dict) -> float:
    object_ids = list(condition["objects"])
    pairs = condition["pairwiseDistances"]
    predicted: dict[str, list[tuple[float, str]]] = {object_id: [] for object_id in object_ids}
    truth: dict[str, list[tuple[float, str]]] = {object_id: [] for object_id in object_ids}
    for pair in pairs:
        first = pair["first_object_id"]
        second = pair["second_object_id"]
        predicted_distance = float(pair["predicted_distance"])
        truth_distance = float(pair["ground_truth_distance"])
        predicted[first].append((predicted_distance, second))
        predicted[second].append((predicted_distance, first))
        truth[first].append((truth_distance, second))
        truth[second].append((truth_distance, first))
    correct = 0
    for object_id in object_ids:
        require(predicted[object_id] and truth[object_id], f"missing pairwise distances for {object_id}")
        predicted_neighbour = min(predicted[object_id])[1]
        truth_neighbour = min(truth[object_id])[1]
        correct += int(predicted_neighbour == truth_neighbour)
    return correct / len(object_ids)


def main() -> None:
    payload = json.loads(DATA.read_text(encoding="utf-8"))
    sequence = payload["sequence"]
    cameras = payload["cameras"]
    conditions = payload["conditions"]

    require(len(cameras) == int(sequence["frameCount"]), "camera count does not match sequence.frameCount")
    require([camera["frameIndex"] for camera in cameras] == list(range(len(cameras))), "camera frame indices are not contiguous")
    x_positions = [float(camera["position"][0]) for camera in cameras]
    close(max(x_positions) - min(x_positions), float(sequence["translationBaselineWorld"]), "camera translation baseline")

    require(len(conditions) == 5, f"expected five evaluation conditions, found {len(conditions)}")
    for condition in conditions:
        summary = condition["summary"]
        objects = condition["objects"]
        pairs = condition["pairwiseDistances"]
        condition_id = condition["id"]

        require(summary["condition_id"] == condition_id, f"summary condition id mismatch for {condition_id}")
        require(int(summary["object_count"]) == len(objects), f"object count mismatch for {condition_id}")
        close(statistics.fmean(float(item["centroidError"]) for item in objects.values()), float(summary["mean_centroid_error"]), f"mean centroid error for {condition_id}")
        close(statistics.fmean(float(item["dimensionRelativeMae"]) for item in objects.values()), float(summary["mean_dimension_relative_mae"]), f"mean dimension MAE for {condition_id}")
        close(statistics.fmean(float(pair["absolute_error"]) for pair in pairs), float(summary["mean_pairwise_distance_error"]), f"mean pairwise error for {condition_id}")
        retained_fraction = statistics.fmean(len(item["retainedFrames"]) / len(item["sourceFrames"]) for item in objects.values())
        close(retained_fraction, float(summary["mean_retained_frame_fraction"]), f"retained-frame fraction for {condition_id}")
        close(nearest_neighbour_accuracy(condition), float(summary["nearest_neighbour_accuracy"]), f"nearest-neighbour accuracy for {condition_id}")

        for object_id, item in objects.items():
            cloud_path = ROOT / "demo" / item["cloudPath"]
            require(cloud_path.is_file(), f"missing published cloud for {condition_id}/{object_id}: {item['cloudPath']}")

    print("Article 02 published-result verification passed")
    print(f"frames={len(cameras)} baseline={sequence['translationBaselineWorld']} conditions={len(conditions)}")


if __name__ == "__main__":
    main()
