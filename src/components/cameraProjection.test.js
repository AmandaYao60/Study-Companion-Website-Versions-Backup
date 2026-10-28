import test from "node:test";
import assert from "node:assert/strict";
import { createCoverProjection } from "./cameraProjection.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const preservesPixelProportions = (project, sourceWidth, sourceHeight) => {
  const center = project({ x: 0.5, y: 0.5 });
  const horizontal = project({ x: 0.5 + 10 / sourceWidth, y: 0.5 });
  const vertical = project({ x: 0.5, y: 0.5 + 10 / sourceHeight });
  close(Math.abs(horizontal.x - center.x), Math.abs(vertical.y - center.y));
};

test("640x480 source in a 4:3 viewport remains aligned and mirrored", () => {
  const project = createCoverProjection(640, 480, 640, 480);
  assert.deepEqual(project({ x: 0, y: 0 }), { x: 640, y: 0 });
  assert.deepEqual(project({ x: 1, y: 1 }), { x: 0, y: 480 });
  assert.deepEqual(project({ x: 0.5, y: 0.5 }), { x: 320, y: 240 });
  preservesPixelProportions(project, 640, 480);
});

test("portrait source covers a 4:3 viewport by cropping vertically without flattening", () => {
  const project = createCoverProjection(480, 640, 640, 480);
  close(project({ x: 0.5, y: 0.5 }).x, 320);
  close(project({ x: 0.5, y: 0.5 }).y, 240);
  close(project({ x: 0.5, y: 0.21875 }).y, 0);
  close(project({ x: 0.5, y: 0.78125 }).y, 480);
  assert.ok(project({ x: 0, y: 0 }).y < 0);
  preservesPixelProportions(project, 480, 640);
});

test("landscape source covers a narrow portrait viewport with centered horizontal crop", () => {
  const project = createCoverProjection(1280, 720, 300, 600);
  close(project({ x: 0.5, y: 0.5 }).x, 150);
  close(project({ x: 0.5, y: 0.5 }).y, 300);
  close(project({ x: 0.359375, y: 0 }).x, 300);
  close(project({ x: 0.640625, y: 1 }).x, 0);
  close(project({ x: 0.5, y: 1 }).y, 600);
  preservesPixelProportions(project, 1280, 720);
});

test("cover projection handles resized viewports and optional non-mirrored presentation", () => {
  const project = createCoverProjection(1920, 1080, 800, 450, { mirrored: false });
  assert.deepEqual(project({ x: 0, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(project({ x: 1, y: 1 }), { x: 800, y: 450 });
  preservesPixelProportions(project, 1920, 1080);
});

test("missing video metadata and zero-size viewports do not produce invalid projections", () => {
  assert.equal(createCoverProjection(0, 0, 640, 480), null);
  assert.equal(createCoverProjection(undefined, undefined, 640, 480), null);
  assert.equal(createCoverProjection(640, 480, 0, 0), null);
});
