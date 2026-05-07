import React from "react";

export default function KnowledgeGraphWorkspaceShell({
  overviewSlot,
  focusInsetSlot,
  railSlot,
  layoutMode = "standalone",
}: {
  overviewSlot: React.ReactNode;
  focusInsetSlot: React.ReactNode;
  railSlot: React.ReactNode;
  layoutMode?: "standalone" | "embedded";
}) {
  return (
    <section className={layoutMode === "standalone"
      ? "grid h-full min-h-[720px] gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]"
      : "grid h-full min-h-[720px] gap-4 grid-cols-[minmax(0,1fr)]"}>
      <div className="relative min-h-[720px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950">
        {overviewSlot}
        <div className={layoutMode === "standalone"
          ? "pointer-events-none absolute inset-x-4 bottom-4 top-4 flex justify-end"
          : "pointer-events-none absolute bottom-4 right-4 top-auto flex justify-end"}>
          <div className={layoutMode === "standalone"
            ? "pointer-events-auto w-full max-w-[420px] self-end lg:self-start"
            : "pointer-events-auto w-full max-w-[320px] self-end"}>
            {focusInsetSlot}
          </div>
        </div>
      </div>
      {layoutMode === "standalone" ? (
        <aside className="min-h-[720px] rounded-[28px] border border-slate-200 bg-white">
          {railSlot}
        </aside>
      ) : null}
    </section>
  );
}
