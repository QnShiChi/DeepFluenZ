import type {
  GraphTimelineCategory,
  GraphTimelineEvent,
  GraphTimelineReasonTag,
} from "./graph-timeline-api.ts";

const CATEGORY_LABELS: Record<GraphTimelineCategory, string> = {
  node: "Node",
  quiz: "Quiz",
  remediation: "Remediation",
  recommendation: "Recommendation",
};

const REASON_TAG_LABELS: Record<GraphTimelineReasonTag, string> = {
  prerequisite_ready: "Đủ điều kiện tiên quyết",
  recent_weakness: "Còn yếu gần đây",
  retry_passed: "Đã vượt qua sau khi làm lại",
  remediation_active: "Đang cần ôn lại",
  remediation_cleared: "Đã hoàn thành ôn lại",
  advanced_to_next: "Đã tiến sang bước mới",
  manual_retry: "Chủ động làm lại",
  mastery_high: "Mức nắm vững cao",
  mastery_uncertain: "Mức nắm vững chưa chắc chắn",
  recent_failure: "Vừa gặp lỗi gần đây",
  retry_loop_detected: "Đang lặp lại cùng một lỗi",
  hint_dependence: "Đang phụ thuộc nhiều vào gợi ý",
  prerequisite_risk_high: "Rủi ro thiếu nền tảng cao",
  remediation_recovered: "Đã hồi phục sau ôn tập",
  ready_to_advance: "Sẵn sàng tiến lên",
  review_due: "Đến lúc ôn tập",
  forgetting_risk_high: "Nguy cơ quên cao",
};

export function getTimelineCategoryLabel(category: GraphTimelineCategory): string {
  return CATEGORY_LABELS[category];
}

export function getTimelineReasonTagLabel(tag: GraphTimelineReasonTag): string {
  return REASON_TAG_LABELS[tag];
}

export function groupTimelineEventsByDay(events: GraphTimelineEvent[]): Array<{
  dayKey: string;
  events: GraphTimelineEvent[];
}> {
  const groups = new Map<string, GraphTimelineEvent[]>();
  for (const event of events) {
    const dayKey = event.created_at.slice(0, 10);
    const bucket = groups.get(dayKey) ?? [];
    bucket.push(event);
    groups.set(dayKey, bucket);
  }
  return Array.from(groups.entries()).map(([dayKey, groupedEvents]) => ({
    dayKey,
    events: groupedEvents,
  }));
}
