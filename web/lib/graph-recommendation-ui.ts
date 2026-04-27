import type { GraphRecommendation } from "./graph-recommendation-api.ts";

export function describeGraphRecommendation(recommendation: GraphRecommendation): {
  badge: string;
  message: string;
} {
  if (recommendation.mode === "remediate") {
    return {
      badge: "Ôn lại trước",
      message: "Bạn nên quay lại phần kiến thức tiên quyết này trước khi học tiếp vì kết quả bài quiz gần đây cho thấy bạn vẫn còn yếu ở đây.",
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
