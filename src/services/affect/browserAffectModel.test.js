import test from "node:test";
import assert from "node:assert/strict";

import { parseAffectOutput, stableSoftmax } from "./browserAffectModel.js";

const sum = (values) => values.reduce((total, value) => total + value, 0);
const argmax = (values) => values.reduce(
  (bestIndex, value, index, allValues) => value > allValues[bestIndex] ? index : bestIndex,
  0
);

test("stable softmax produces eight finite probabilities for large logits", () => {
  const logits = [1000, 995, 990, 980, 970, 960, 950, 940];
  const probabilities = stableSoftmax(logits);

  assert.equal(probabilities.length, 8);
  assert.ok(probabilities.every((value) => Number.isFinite(value) && value >= 0 && value <= 1));
  assert.ok(Math.abs(sum(probabilities) - 1) < 1e-12);
  assert.equal(argmax(probabilities), argmax(logits));
});

test("affect output parser excludes valence and arousal from emotion softmax", () => {
  const output = [0, 1, 2, 3, 4, 5, 6, 7, 1000, -1000];
  const result = parseAffectOutput(output);

  assert.equal(result.emotion, "Surprise");
  assert.equal(result.valence, 1000);
  assert.equal(result.arousal, -1000);
  assert.deepEqual(result.emotionLogits, output.slice(0, 8));
  assert.equal(result.emotionProbabilities.length, 8);
  assert.equal(result.topEmotionProbability, Math.max(...result.emotionProbabilities));
  assert.equal(argmax(result.emotionProbabilities), argmax(result.emotionLogits));
  assert.ok(Math.abs(sum(result.emotionProbabilities) - 1) < 1e-12);
});

test("affect output parser rejects malformed and non-finite model output", () => {
  assert.throws(
    () => parseAffectOutput([0, 1, 2]),
    /Unexpected affect output length/
  );

  assert.throws(
    () => parseAffectOutput([0, 1, 2, 3, 4, Number.NaN, 6, 7, 0.2, 0.3]),
    /non-finite output/
  );

  assert.throws(
    () => stableSoftmax([0, 1, 2]),
    /Expected 8 emotion logits/
  );
});
