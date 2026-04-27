import type { GraphRecommendation } from "./graph-recommendation-api.ts";

export function describeGraphRecommendation(recommendation: GraphRecommendation): {
  badge: string;
  message: string;
} {
  if (recommendation.mode === "remediate") {
    return {
      badge: "Review first",
      message: "You should revisit this prerequisite area before moving forward because recent quiz results indicate weakness here.",
    };
  }
  if (recommendation.mode === "review") {
    return {
      badge: "Review",
      message: "This node has been explored but should be reinforced before advancing further.",
    };
  }
  return {
    badge: "Next",
    message: "This is the strongest next step based on prerequisite readiness and course progression.",
  };
}
