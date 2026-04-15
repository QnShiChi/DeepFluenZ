# Knowledge Graph UI Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Implement the React Flow graph viewer on the frontend and integrate it into the Desktop split-pane layout.

**Architecture:** Create a `KnowledgeGraphViewer` component using `@xyflow/react`. Integrate this component into the `web/app/(workspace)/page.tsx` making a Left/Right split-pane.

**Tech Stack:** React, Next.js, Tailwind, @xyflow/react.

---

### Task 1: Setup React Flow Viewer Component

**Files:**
- Create: `web/components/graph/KnowledgeGraphViewer.tsx`

**Step 1: Write the failing test / initial minimal structure**
*(Frontend Note: We will write the component foundation before asserting layout)*

```tsx
// web/components/graph/KnowledgeGraphViewer.tsx
import React from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Chapter 1' } },
];
const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }];

export default function KnowledgeGraphViewer() {
  return (
    <div className="w-full h-full bg-slate-50 relative">
      <ReactFlow nodes={initialNodes} edges={initialEdges}>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

**Step 2: Run verification**
Run: `npm run lint` inside `web/` to ensure syntax is valid. 
Expected: PASS depending on xyflow installation. If `@xyflow/react` is missing, install it.

**Step 3: Commit**
```bash
git add web/components/graph/KnowledgeGraphViewer.tsx
git commit -m "feat(ui): add basic knowledge graph viewer component"
```

### Task 2: Implement Split-Pane Workspace Layout

**Files:**
- Modify: `web/app/(workspace)/page.tsx`

**Step 1: Write the minimal implementation**

```tsx
// web/app/(workspace)/page.tsx
// Add split pane classes: flex-row, left 40%, right 60%
import KnowledgeGraphViewer from '@/components/graph/KnowledgeGraphViewer';

// Note: Ensure the parent container is h-screen and flex
export default function WorkspacePage() {
  return (
    <div className="flex h-screen w-full">
      {/* Left Pane: Knowledge Graph */}
      <div className="hidden lg:block w-[40%] h-full border-r border-slate-200">
        <KnowledgeGraphViewer />
      </div>

      {/* Right Pane: Action Area */}
      <div className="w-full lg:w-[60%] h-full flex flex-col">
          {/* Main existing chat / workspace content goes here */}
          <div className="flex-1 p-4">
              <h1>Action Area</h1>
          </div>
      </div>
    </div>
  );
}
```

**Step 2: Run verification**
Run: `npm run build` or `npm run lint` in `web/` 
Expected: PASS

**Step 3: Commit**
```bash
git add web/app/(workspace)/page.tsx
git commit -m "feat(ui): implement split-pane desktop layout for knowledge graph"
```
