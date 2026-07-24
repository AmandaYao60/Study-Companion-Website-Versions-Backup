import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, "EmotionalEngagementChart.js"), "utf8");

test("emotional engagement chart no longer renders hardcoded VA emotion regions", () => {
  assert.equal(source.includes("CIRCUMPLEX_REFERENCE_REGIONS"), false);
  assert.equal(source.includes("<ellipse"), false);
  assert.equal(source.includes("Emotion regions are illustrative"), false);
});

test("emotional engagement chart keeps distribution and point tooltips inside expanded analysis", () => {
  assert.match(source, /function EmotionalEngagementDialog/);
  assert.match(source, /function ExpressionDistributionChart/);
  assert.match(source, /createPortal/);
  assert.match(source, /document\.body/);
  assert.match(source, /h-\[92dvh\]/);
  assert.match(source, /z-\[1000\]/);
  assert.match(source, /interactive=\{false\}/);
  assert.match(source, /useCallback/);
  assert.match(source, /Top probability/);
  assert.match(source, /intervalLabel/);
  assert.equal(source.includes("Confidence:"), false);
  assert.equal(source.includes("disabled={!hasTrajectory}"), false);
});
