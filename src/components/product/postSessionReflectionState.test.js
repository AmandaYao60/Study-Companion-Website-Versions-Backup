import assert from "node:assert/strict";
import test from "node:test";

import {
  createPostSessionReflectionSteps,
  hasPreviousPostSessionStep,
  initialReflection,
  resolvePostSessionStepIndex,
  shouldShowCenteredPostSessionContinue,
} from "./postSessionReflectionState.js";

test("first post-session step has no previous navigation boundary", () => {
  const steps = createPostSessionReflectionSteps({ draft: initialReflection });
  assert.equal(steps[0].id, "sessionEnergy");
  assert.equal(hasPreviousPostSessionStep(steps, steps[0]), false);
  assert.equal(hasPreviousPostSessionStep(steps, steps[1]), true);
});

test("centered post-session Continue appears only for non-auto-advance entry steps", () => {
  const draftWithStrategy = {
    ...initialReflection,
    strategiesUsed: ["elaboration"],
  };
  const steps = createPostSessionReflectionSteps({ draft: draftWithStrategy });
  const byId = Object.fromEntries(steps.map((step) => [step.id, step]));

  assert.equal(shouldShowCenteredPostSessionContinue(byId.strategiesUsed), true);
  assert.equal(shouldShowCenteredPostSessionContinue(byId.learningReflection), true);
  assert.equal(shouldShowCenteredPostSessionContinue(byId.nextSessionAdjustment), true);
  assert.equal(shouldShowCenteredPostSessionContinue(byId.sessionEnergy), false);
  assert.equal(shouldShowCenteredPostSessionContinue(byId.primaryStrategy), false);
  assert.equal(shouldShowCenteredPostSessionContinue(byId.primaryLearningActivity), false);
});

test("post-session step reconstruction restores stable IDs and falls back safely", () => {
  const draftWithStrategy = {
    ...initialReflection,
    strategiesUsed: ["elaboration"],
  };
  const conditionalSteps = createPostSessionReflectionSteps({ draft: draftWithStrategy });
  assert.equal(
    conditionalSteps[resolvePostSessionStepIndex(conditionalSteps, "primaryStrategy")].id,
    "primaryStrategy"
  );

  const plainSteps = createPostSessionReflectionSteps({ draft: initialReflection });
  assert.equal(
    plainSteps[resolvePostSessionStepIndex(plainSteps, "primaryStrategy")].id,
    "strategiesUsed"
  );
  assert.equal(
    plainSteps[resolvePostSessionStepIndex(plainSteps, "not-a-real-step")].id,
    "sessionEnergy"
  );
});
