/**
 * Metric categories supported by the tracker
 */
export const METRIC_CATEGORIES = {
  FOOD: "food",
  EXERCISE: "exercise",
  WEIGHT: "weight",
  WATER: "water",
  SLEEP: "sleep",
  SUPPLEMENT: "supplement",
} as const;

export type MetricCategory =
  (typeof METRIC_CATEGORIES)[keyof typeof METRIC_CATEGORIES];

/**
 * Common units per category
 */
export const CATEGORY_UNITS: Record<MetricCategory, string[]> = {
  food: ["kcal", "g", "portion"],
  exercise: ["min", "km", "reps", "sets"],
  weight: ["kg", "lb"],
  water: ["ml", "L", "glasses"],
  sleep: ["hours", "min"],
  supplement: ["mg", "g", "units"],
};
