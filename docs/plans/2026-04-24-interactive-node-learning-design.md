# Interactive Node-based Learning

Enable students to interact with Knowledge Graph nodes to learn topics and test knowledge, bridging the static graph with the existing Chat + Quiz capabilities.

## UX Flow

```
Click Node on Graph → Node Detail Panel slides in (inside the 40% left pane)
  → Shows: title, description, difficulty badge, node_type badge
  → Button "Hỏi đáp" → Injects topic into Chat (capability=chat, tool=rag)
  → Button "Kiểm tra" → Injects topic into Chat (capability=deep_question)
  → Click outside / ✕ → Panel closes
```

## Proposed Changes

### Frontend — Graph Components

#### [NEW] [NodeDetailPanel.tsx](file:///home/phan-duong-quoc-nhat/workspace/DeepTutor/web/components/graph/NodeDetailPanel.tsx)

Slide-in overlay panel rendered inside `KnowledgeGraphViewer`. Appears when a node is clicked.

- Props: `node: SelectedNodeData | null`, `onClose()`, `onAskAbout(node)`, `onQuizNode(node)`
- Displays: title, description, difficulty badge (easy/medium/hard), node_type icon/badge
- Two action buttons: "Hỏi đáp về chủ đề này" and "Kiểm tra kiến thức"
- Positioned as absolute overlay on the right side of the graph pane
- Slide-in animation from right, dismiss on click outside or ✕ button

---

#### [MODIFY] [course-knowledge-graph.ts](file:///home/phan-duong-quoc-nhat/workspace/DeepTutor/web/lib/course-knowledge-graph.ts)

Extend `mapCourseKnowledgeGraphToFlow` to pass `description` through to ReactFlow node data (currently only passes `label`, `nodeType`, `difficulty`).

```diff
 data: {
   label: node.title,
+  description: node.description ?? "",
   nodeType: node.node_type,
   difficulty: node.difficulty ?? "medium",
 },
```

---

#### [MODIFY] [KnowledgeGraphViewer.tsx](file:///home/phan-duong-quoc-nhat/workspace/DeepTutor/web/components/graph/KnowledgeGraphViewer.tsx)

1. Add `onNodeClick` handler to ReactFlow that sets selected node state.
2. Accept new callback props: `onAskAbout(node)` and `onQuizNode(node)`.
3. Render `NodeDetailPanel` as a child overlay.

---

### Frontend — Main Page Integration

#### [MODIFY] [page.tsx](file:///home/phan-duong-quoc-nhat/workspace/DeepTutor/web/app/(workspace)/page.tsx)

1. Pass `onAskAbout` and `onQuizNode` callbacks to `KnowledgeGraphViewer`.
2. `onAskAbout(node)`: calls `setCapability(null)` + `setTools(["rag"])` + `sendMessage("Hãy giải thích cho tôi về: {title}. {description}")`.
3. `onQuizNode(node)`: calls `setCapability("deep_question")` + `sendMessage(title, [], { topic: title, num_questions: 3 })`.

---

### No Backend Changes Required

All existing APIs are reused:
- `ChatCapability` with `rag` tool for Q&A
- `DeepQuestionCapability` for quiz generation

## Verification Plan

### Existing Tests
Run `npx vitest run tests/course-knowledge-graph.test.ts` (or `node --test tests/course-knowledge-graph.test.ts`) to ensure `mapCourseKnowledgeGraphToFlow` still passes after adding `description` to node data.

### Manual Browser Verification
1. Open `localhost:3782`, import a syllabus PDF
2. Click on any node in the Knowledge Graph → Verify the NodeDetailPanel slides in with correct title, description, difficulty
3. Click "Hỏi đáp" → Verify a new chat message appears on the right pane and AI responds using RAG context
4. Click "Kiểm tra" → Verify the capability switches to Quiz mode and generates questions about the topic
5. Click ✕ or outside panel → Verify panel closes
6. Click a different node → Verify panel updates with new node info
