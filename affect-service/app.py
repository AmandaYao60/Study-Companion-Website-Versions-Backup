from __future__ import annotations

import time
from contextlib import asynccontextmanager

import cv2
import numpy as np
from emotiefflib.facial_analysis import EmotiEffLibRecognizer
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware


MODEL_NAME = "enet_b0_8_va_mtl"
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB

# The recognizer is loaded once when the server starts.
# It is not recreated for every request.
affect_recognizer = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Load the ONNX model once when FastAPI starts.

    The first run may download model files, so the computer may need
    an internet connection during initial startup.
    """
    global affect_recognizer

    print(f"Loading EmotiEffLib model: {MODEL_NAME}")

    affect_recognizer = EmotiEffLibRecognizer(
        engine="onnx",
        model_name=MODEL_NAME,
        device="cpu",
    )

    print("EmotiEffLib model loaded successfully.")

    yield

    affect_recognizer = None
    print("EmotiEffLib model released.")


app = FastAPI(
    title="AegisMind Affect Service",
    description=(
        "Local facial-affect inference service using "
        "EmotiEffLib and ONNX Runtime."
    ),
    version="0.1.0",
    lifespan=lifespan,
)


# Allow your local Next.js development server to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


def decode_uploaded_image(image_bytes: bytes) -> np.ndarray:
    """
    Decode uploaded JPEG, PNG, or WebP bytes into an RGB NumPy image.

    EmotiEffLib expects RGB image arrays. OpenCV decodes images as BGR,
    so the image must be converted before inference.
    """
    if not image_bytes:
        raise ValueError("The uploaded image is empty.")

    encoded_array = np.frombuffer(image_bytes, dtype=np.uint8)

    image_bgr = cv2.imdecode(
        encoded_array,
        cv2.IMREAD_COLOR,
    )

    if image_bgr is None:
        raise ValueError(
            "The uploaded file could not be decoded as an image."
        )

    image_rgb = cv2.cvtColor(
        image_bgr,
        cv2.COLOR_BGR2RGB,
    )

    return image_rgb


def predict_affect(face_rgb: np.ndarray) -> dict:
    """
    Run EmotiEffLib on one already-cropped facial image.

    For the enet_b0_8_va_mtl model:
    - the first eight scores correspond to expression outputs;
    - the final two values are treated as valence and arousal.

    Returns a normalized project-level response rather than exposing
    the entire EmotiEffLib API to the frontend.
    """
    if affect_recognizer is None:
        raise RuntimeError("The affect model has not been loaded.")

    if not isinstance(face_rgb, np.ndarray):
        raise TypeError("face_rgb must be a NumPy array.")

    if face_rgb.ndim != 3 or face_rgb.shape[2] != 3:
        raise ValueError(
            "The input must be an RGB image with shape H × W × 3."
        )

    emotion_labels, scores = affect_recognizer.predict_emotions(
        face_rgb,
        logits=False,
    )

    # One input image produces one row.
    output = np.asarray(scores[0], dtype=np.float32)

    # The MTL model contains expression outputs followed by two
    # continuous affect values.
    if output.size < 10:
        raise RuntimeError(
            f"Unexpected model output shape: {scores.shape}. "
            "Expected at least 10 values for the 8-class VA MTL model."
        )

    expression_probabilities = output[:-2]
    valence = float(output[-2])
    arousal = float(output[-1])

    # Defensive clipping because VA values are conventionally handled
    # in the [-1, 1] range.
    valence = float(np.clip(valence, -1.0, 1.0))
    arousal = float(np.clip(arousal, -1.0, 1.0))

    confidence = float(np.max(expression_probabilities))

    return {
        "emotion": emotion_labels[0],
        "valence": valence,
        "arousal": arousal,
        "expressionConfidence": confidence,
        "valid": True,
        "model": MODEL_NAME,
    }


@app.get("/")
def root():
    return {
        "service": "AegisMind Affect Service",
        "status": "running",
        "model": MODEL_NAME,
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "modelLoaded": affect_recognizer is not None,
        "model": MODEL_NAME,
    }


@app.post("/predict-affect")
async def predict_affect_endpoint(
    face: UploadFile = File(...)
):
    """
    Accept one cropped facial image and return estimated facial
    expression, valence, and arousal.

    The uploaded image is processed in memory and is not written
    to disk by this endpoint.
    """
    allowed_content_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if face.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=415,
            detail=(
                "Unsupported image type. "
                "Please upload JPEG, PNG, or WebP."
            ),
        )

    image_bytes = await face.read()

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="The uploaded image is larger than 5 MB.",
        )

    start_time = time.perf_counter()

    try:
        face_rgb = decode_uploaded_image(image_bytes)
        result = predict_affect(face_rgb)

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        ) from error

    except Exception as error:
        # During development, log the full internal error in the terminal.
        print(f"Affect inference failed: {error}")

        raise HTTPException(
            status_code=500,
            detail="Affect inference failed.",
        ) from error

    latency_ms = round(
        (time.perf_counter() - start_time) * 1000,
        2,
    )

    return {
        **result,
        "latencyMs": latency_ms,
        "image": {
            "width": int(face_rgb.shape[1]),
            "height": int(face_rgb.shape[0]),
        },
    }