import { EMOTION_LABELS } from "./sessionConstants.js";

// Illustrative reference regions only. These are not diagnostic boundaries.
// The categorical emotion output must come from EmotiEffLib; do not derive the model emotion category solely from VA coordinates.
// This configuration is isolated so it can be revised after reviewing professional literature.
export const CIRCUMPLEX_REFERENCE_REGIONS = Object.freeze([
  { id: "neutral", label: "Neutral", valence: 0, arousal: 0, regionRadiusX: 0.22, regionRadiusY: 0.22, description: "Centered reference area for neutral affect output." },
  { id: "happiness", label: "Happiness", valence: 0.65, arousal: 0.35, regionRadiusX: 0.25, regionRadiusY: 0.28, description: "Illustrative positive-valence, moderate-activation region." },
  { id: "sadness", label: "Sadness", valence: -0.55, arousal: -0.35, regionRadiusX: 0.25, regionRadiusY: 0.28, description: "Illustrative negative-valence, lower-activation region." },
  { id: "surprise", label: "Surprise", valence: 0.15, arousal: 0.75, regionRadiusX: 0.25, regionRadiusY: 0.25, description: "Illustrative high-activation region with variable valence." },
  { id: "fear", label: "Fear", valence: -0.65, arousal: 0.65, regionRadiusX: 0.25, regionRadiusY: 0.28, description: "Illustrative negative-valence, high-activation region." },
  { id: "disgust", label: "Disgust", valence: -0.7, arousal: 0.25, regionRadiusX: 0.24, regionRadiusY: 0.26, description: "Illustrative negative-valence, moderate-activation region." },
  { id: "anger", label: "Anger", valence: -0.75, arousal: 0.55, regionRadiusX: 0.25, regionRadiusY: 0.28, description: "Illustrative negative-valence, elevated-activation region." },
  { id: "contempt", label: "Contempt", valence: -0.45, arousal: 0.15, regionRadiusX: 0.25, regionRadiusY: 0.25, description: "Illustrative negative-valence, lower-to-moderate activation region." },
]);

export const CIRCUMPLEX_REFERENCE_LABELS = Object.freeze(CIRCUMPLEX_REFERENCE_REGIONS.map((region) => region.label));
export const hasCompleteCircumplexReferenceSet = () => EMOTION_LABELS.every((label) => CIRCUMPLEX_REFERENCE_LABELS.includes(label));
