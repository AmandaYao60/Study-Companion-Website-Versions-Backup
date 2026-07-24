import * as ort from "onnxruntime-web";
import { canvasToAffectTensor } from "./affectPreprocessing.js";

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

export const stableSoftmax = (logits) => {
  if (!Array.isArray(logits) || logits.length !== EMOTION_LABELS.length) {
    throw new Error(`Expected ${EMOTION_LABELS.length} emotion logits for softmax.`);
  }

  if (!logits.every(Number.isFinite)) {
    throw new Error("Affect model returned non-finite emotion logits.");
  }

  const maxLogit = Math.max(...logits);
  const exponentials = logits.map((value) => Math.exp(value - maxLogit));
  const denominator = exponentials.reduce((sum, value) => sum + value, 0);

  if (!Number.isFinite(denominator) || denominator <= 0) {
    throw new Error("Affect emotion softmax denominator was invalid.");
  }

  const probabilities = exponentials.map((value) => value / denominator);

  if (!probabilities.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw new Error("Affect emotion softmax produced invalid probabilities.");
  }

  return probabilities;
};

export const parseAffectOutput = (rawOutput) => {
  if (!Array.isArray(rawOutput) || rawOutput.length !== EXPECTED_OUTPUT_LENGTH) {
    throw new Error(
      `Unexpected affect output length: expected ${EXPECTED_OUTPUT_LENGTH}, received ${rawOutput?.length ?? 0}.`
    );
  }

  if (!rawOutput.every(Number.isFinite)) {
    throw new Error("Affect model returned non-finite output values.");
  }

  const emotionLogits = rawOutput.slice(0, EMOTION_LABELS.length);
  const emotionProbabilities = stableSoftmax(emotionLogits);
  const predictedEmotionIndex = emotionLogits.reduce(
    (bestIndex, value, index, values) => value > values[bestIndex] ? index : bestIndex,
    0
  );

  const probabilityIndex = emotionProbabilities.reduce(
    (bestIndex, value, index, values) => value > values[bestIndex] ? index : bestIndex,
    0
  );

  if (probabilityIndex !== predictedEmotionIndex) {
    throw new Error("Affect emotion softmax argmax did not match logit argmax.");
  }

  return {
    emotion: EMOTION_LABELS[predictedEmotionIndex],
    emotionLogits,
    emotionProbabilities,
    topEmotionProbabilities: emotionProbabilities
      .map((probability, index) => ({
        emotion: EMOTION_LABELS[index],
        probability,
      }))
      .sort((left, right) => right.probability - left.probability)
      .slice(0, 3),
    topEmotionProbability: emotionProbabilities[predictedEmotionIndex],
    valence: rawOutput[VALENCE_INDEX],
    arousal: rawOutput[AROUSAL_INDEX],
  };
};

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
  const affectOutput = parseAffectOutput(rawOutput);

  return {
    ...affectOutput,
    rawOutput,
    outputName,
    outputDimensions: Array.from(outputTensor.dims),
    source: "browser-onnx-wasm",
    valid: true,
  };
};
