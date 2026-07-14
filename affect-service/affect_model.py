from __future__ import annotations

from typing import Any

import cv2
import numpy as np
from emotiefflib.facial_analysis import EmotiEffLibRecognizer


class AffectModel:
    """Wrapper around EmotiEffLib for valence/arousal inference."""

    def __init__(self) -> None:
        self.model_name = "enet_b0_8_va_mtl"

        self.recognizer = EmotiEffLibRecognizer(
            engine="onnx",
            model_name=self.model_name,
        )

    def predict(self, face_rgb: np.ndarray) -> dict[str, Any]:
        """
        Predict affect from an RGB face crop.

        Args:
            face_rgb:
                Cropped RGB face image with shape (height, width, 3).

        Returns:
            Dictionary containing emotion, valence and arousal.
        """
        if not isinstance(face_rgb, np.ndarray):
            raise TypeError("face_rgb must be a NumPy array.")

        if face_rgb.ndim != 3 or face_rgb.shape[2] != 3:
            raise ValueError(
                "face_rgb must have shape (height, width, 3)."
            )

        emotion_labels, scores = self.recognizer.predict_emotions(
            face_rgb,
            logits=True,
        )

        output = np.asarray(scores)[0]

        if output.shape[0] < 3:
            raise RuntimeError(
                f"Unexpected output length: {output.shape[0]}"
            )

        valence = float(output[-2])
        arousal = float(output[-1])

        return {
            "emotion": emotion_labels[0],
            "valence": valence,
            "arousal": arousal,
            "valid": True,
            "model": self.model_name,
        }

def load_rgb_image(image_path: str) -> np.ndarray:
    """Read an image from disk and convert BGR to RGB."""
    image_bgr = cv2.imread(image_path)

    if image_bgr is None:
        raise FileNotFoundError(
            f"Could not read image: {image_path}"
        )

    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)