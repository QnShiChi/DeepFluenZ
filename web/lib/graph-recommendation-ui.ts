import type { GraphRecommendation } from "./graph-recommendation-api.ts";

export function describeGraphRecommendation(recommendation: GraphRecommendation): {
  badge: string;
  message: string;
} {
  if (recommendation.mode === "remediate") {
    return {
      badge: "ÔN LẠI",
      message: "Bạn nên ôn lại phần còn yếu trước khi tiếp tục học sang nút kế tiếp.",
    };
  }
  if (recommendation.mode === "review") {
    return {
      badge: "Ôn tập",
      message: "Bạn đã tìm hiểu nút này, nhưng nên củng cố thêm trước khi tiến xa hơn trong lộ trình học.",
    };
  }
  return {
    badge: "Tiếp theo",
    message: "Đây là bước học phù hợp nhất tiếp theo dựa trên mức sẵn sàng của kiến thức tiên quyết và tiến trình của môn học.",
  };
}

export function getGraphRecommendationTimelineCtaLabel(
  recommendation: Pick<GraphRecommendation, "mode">,
): string {
  if (recommendation.mode === "remediate") {
    return "Vì sao cần ôn lại?";
  }
  return "Vì sao được đề xuất?";
}
