import * as ort from "onnxruntime-web";
import { canvasToAffectTensor } from "./affectPreprocessing";

const MODEL_URL = "/models/emotieff/enet_b0_8_va_mtl.onnx";

const EMOTION_LABELS = [
  "Anger",
  "Contempt",
  "Disgust",
  "Fear",
  "Happiness",
  "Neutral",
  "Sadness",
  "Surprise",
];

const EXPECTED_OUTPUT_LENGTH = 10;
const VALENCE_INDEX = 8;
const AROUSAL_INDEX = 9;

let sessionPromise = null;

const createSession = async () => {
  const session =
    await ort.InferenceSession.create(
      MODEL_URL,
      {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }
    );
    if (process.env.NODE_ENV === "development") {
        console.log("Affect ONNX model loaded:", {
            inputNames: session.inputNames,
            outputNames: session.outputNames,
            inputMetadata: session.inputMetadata,
            outputMetadata: session.outputMetadata,
        });
    }
  return session;
};

export const getAffectSession = () => {
  if (!sessionPromise) {
    sessionPromise = createSession();
  }

  return sessionPromise;
};


export const predictAffectFromCanvas = async (canvas) => {
  const session = await getAffectSession();
  const inputTensor = canvasToAffectTensor(canvas);
  const inputName = session.inputNames[0];
  if (!inputName) {
    throw new Error(
      "Affect model has no declared input name."
    );
  }

  const outputs = await session.run({
    [inputName]: inputTensor,
  });

  const outputName = session.outputNames[0];
  const outputTensor = outputs[outputName];

  if (!outputTensor?.data) {
    throw new Error("Affect model returned no output tensor.");
  }

  const rawOutput = Array.from(outputTensor.data);

  if (rawOutput.length !== EXPECTED_OUTPUT_LENGTH) {
    throw new Error(
      `Unexpected affect output length: expected ${EXPECTED_OUTPUT_LENGTH}, received ${rawOutput.length}.`
    );
  }
  
  const emotionLogits = rawOutput.slice(0, EMOTION_LABELS.length);
  const predictedEmotionIndex = emotionLogits.reduce((bestIndex, value, index, values) => value > values[bestIndex] ? index : bestIndex, 0);

  const valence = rawOutput[VALENCE_INDEX];
  const arousal = rawOutput[AROUSAL_INDEX];

  return {
    valence,
    arousal,
    emotion: EMOTION_LABELS[predictedEmotionIndex],
     emotionLogits,
    rawOutput,
    outputName,
    outputDimensions: Array.from(outputTensor.dims),
    source: "browser-onnx-wasm",
    valid: Number.isFinite(valence) && Number.isFinite(arousal),
  };
};
