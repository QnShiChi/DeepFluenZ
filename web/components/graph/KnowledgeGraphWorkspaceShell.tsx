import React from "react";

export default function KnowledgeGraphWorkspaceShell({
  overviewSlot,
  focusInsetSlot,
  railSlot,
}: {
  overviewSlot: React.ReactNode;
  focusInsetSlot: React.ReactNode;
  railSlot: React.ReactNode;
}) {
  return (
    <section className="grid h-full min-h-[720px] gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(320px,1fr)]">
      <div className="relative min-h-[720px] overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950">
        {overviewSlot}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 top-4 flex justify-end">
          <div className="pointer-events-auto w-full max-w-[420px] self-end lg:self-start">
            {focusInsetSlot}
          </div>
        </div>
      </div>
      <aside className="min-h-[720px] rounded-[28px] border border-slate-200 bg-white">
        {railSlot}
      </aside>
    </section>
  );
}
