import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTO_ADVANCE_IDLE_MS,
  NAV_DIRECTION,
  TRANSITION_PHASE,
  getCircularNavButtonClass,
  getQuestionTransitionClass,
  isSingleChoiceAutoAdvanceStep,
} from "./questionnaireNavigation.js";

test("questionnaire single-choice auto advance uses a full one-second idle delay", () => {
  assert.equal(AUTO_ADVANCE_IDLE_MS, 1000);
});

test("questionnaire auto advance is limited to eligible single-choice changes", () => {
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "choice" }, "math"), true);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "choice" }, "other"), false);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "rating" }, 4), true);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "rating" }, 4.5), false);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "primaryStrategy" }, "elaboration"), true);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "learningActivity" }, "worked_with_material"), true);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "strategies" }, ["rehearsal"]), false);
  assert.equal(isSingleChoiceAutoAdvanceStep({ type: "text" }, "notes"), false);
});

test("question transition classes encode explicit forward and backward direction", () => {
  assert.match(
    getQuestionTransitionClass({ direction: NAV_DIRECTION.FORWARD, phase: TRANSITION_PHASE.EXITING }),
    /-translate-x-8/
  );
  assert.match(
    getQuestionTransitionClass({ direction: NAV_DIRECTION.BACKWARD, phase: TRANSITION_PHASE.EXITING }),
    /translate-x-8/
  );
  assert.match(
    getQuestionTransitionClass({ direction: NAV_DIRECTION.FORWARD, phase: TRANSITION_PHASE.ENTERING }),
    /translate-x-8/
  );
  assert.match(
    getQuestionTransitionClass({ direction: NAV_DIRECTION.BACKWARD, phase: TRANSITION_PHASE.ENTERING }),
    /-translate-x-8/
  );
});

test("reduced-motion transition removes horizontal slide without changing visibility states", () => {
  const reduced = getQuestionTransitionClass({
    direction: NAV_DIRECTION.FORWARD,
    phase: TRANSITION_PHASE.EXITING,
    reducedMotion: true,
  });
  assert.match(reduced, /translate-x-0/);
  assert.match(reduced, /opacity-0/);
  assert.doesNotMatch(reduced, /translate-x-8/);
});

test("circular navigation controls use a stable touch target and disabled style", () => {
  const className = getCircularNavButtonClass({ theme: "emerald" });
  assert.match(className, /h-10/);
  assert.match(className, /w-10/);
  assert.match(className, /rounded-full/);
  assert.match(className, /disabled:opacity-45/);
  assert.match(className, /focus-visible:ring-emerald-300/);
});
