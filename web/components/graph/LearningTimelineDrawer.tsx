import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type {
  GraphTimelineAction,
  GraphTimelineCategory,
  GraphTimelineEvent,
} from "@/lib/graph-timeline-api";
import {
  getTimelineCategoryLabel,
  getTimelineReasonTagLabel,
  groupTimelineEventsByDay,
} from "@/lib/graph-timeline-ui";

const FILTERS: Array<"all" | GraphTimelineCategory> = [
  "all",
  "node",
  "quiz",
  "remediation",
  "recommendation",
];

interface LearningTimelineDrawerProps {
  events: GraphTimelineEvent[];
  requestKey?: number;
  defaultCollapsed?: boolean;
  focusedNodeId?: string;
  onClearNodeFocus?: () => void;
  onAction: (action: GraphTimelineAction, event: GraphTimelineEvent) => void;
  onSelectNode: (nodeId: string) => void;
}

export default function LearningTimelineDrawer({
  events,
  requestKey = 0,
  defaultCollapsed = true,
  focusedNodeId = "",
  onClearNodeFocus,
  onAction,
  onSelectNode,
}: LearningTimelineDrawerProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [filter, setFilter] = useState<"all" | GraphTimelineCategory>("all");
  const [expandedEventId, setExpandedEventId] = useState("");

  useEffect(() => {
    if (requestKey > 0) {
      setCollapsed(false);
    }
  }, [requestKey]);

  const filteredEvents = useMemo(
    () => events.filter((event) => filter === "all" || event.category === filter),
    [events, filter],
  );
  const groupedEvents = useMemo(
    () => groupTimelineEventsByDay(filteredEvents),
    [filteredEvents],
  );

  return (
    <aside
      className={`absolute top-48 left-4 z-10 flex max-h-[calc(100%-12rem)] transition-all duration-200 ${
        collapsed ? "w-16" : "w-96"
      }`}
    >
      <button
        onClick={() => setCollapsed((value) => !value)}
        className="flex shrink-0 flex-col items-center justify-between rounded-r-2xl border border-l-0 border-slate-200 bg-white/95 px-2 py-3 text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-slate-50"
        aria-label={collapsed ? "Open Learning Timeline" : "Collapse Learning Timeline"}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] [writing-mode:vertical-rl]">
          Learning Timeline
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-700">
          {events.length}
        </span>
      </button>

      {!collapsed ? (
        <div className="min-w-0 flex-1 overflow-y-auto rounded-l-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Learning Timeline</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Theo dõi tiến trình học gần đây và vì sao hệ thống đổi hướng đề xuất.
              </p>
            </div>
          </div>

          {focusedNodeId ? (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              <span>Đang focus node: {focusedNodeId}</span>
              <button
                onClick={onClearNodeFocus}
                className="font-medium underline underline-offset-2"
              >
                Xóa focus
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  filter === value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {value === "all" ? "All" : getTimelineCategoryLabel(value)}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-4">
            {groupedEvents.map((group) => (
              <section key={group.dayKey}>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.dayKey}
                </h3>
                <div className="mt-2 space-y-2">
                  {group.events.map((event) => (
                    <div
                      key={event.event_id}
                      className={`rounded-xl border px-3 py-3 text-xs ${
                        event.highlighted
                          ? "border-slate-300 bg-white text-slate-800 shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold">{event.summary}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {event.reason_tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                              >
                                {getTimelineReasonTagLabel(tag)}
                              </span>
                            ))}
                          </div>
                        </div>
                        {event.node_id ? (
                          <button
                            onClick={() => onSelectNode(event.node_id)}
                            className="text-[11px] font-medium text-sky-700"
                          >
                            Xem node
                          </button>
                        ) : null}
                      </div>

                      {event.actions.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {event.actions.map((action) => (
                            <button
                              key={`${event.event_id}:${action.kind}`}
                              onClick={() => onAction(action, event)}
                              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      ) : null}

                      <button
                        onClick={() => setExpandedEventId((current) => (current === event.event_id ? "" : event.event_id))}
                        className="mt-2 text-[11px] font-medium text-slate-500"
                      >
                        {expandedEventId === event.event_id ? "Ẩn chi tiết" : "Xem chi tiết"}
                      </button>

                      {expandedEventId === event.event_id ? (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-[11px] text-slate-100">
                          {JSON.stringify(event.details, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
