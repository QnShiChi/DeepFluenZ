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
    const reviewMode = recommendation.review_mode ?? "light_recall_check";
    if (reviewMode === "full_node_review") {
      return {
        badge: "Ôn tập",
        message: "Một phần nền tảng quan trọng đang đến lúc cần ôn lại để giữ đà học và mở khóa bước tiếp theo.",
      };
    }
    if (reviewMode === "focused_review") {
      return {
        badge: "Ôn điểm yếu",
        message: "Hệ thống phát hiện một nhóm ý chính đang yếu dần. Ôn nhanh phần này sẽ giúp bạn học tiếp chắc hơn.",
      };
    }
    return {
      badge: "Nhắc lại ngắn",
      message: "Bạn đã học phần này rồi, nhưng một lượt nhắc lại ngắn lúc này sẽ giúp ghi nhớ bền hơn.",
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
  if (recommendation.mode === "review") {
    return "Vì sao nên ôn tập?";
  }
  return "Vì sao được đề xuất?";
}
