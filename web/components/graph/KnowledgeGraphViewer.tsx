import React from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 250, y: 50 }, data: { label: 'Chapter 1: Intro' }, type: 'default' },
  { id: '2', position: { x: 250, y: 200 }, data: { label: 'Chapter 2: Vars' }, type: 'default' },
  { id: 'sq_1', position: { x: 450, y: 125 }, data: { label: 'Refresher' }, type: 'default' },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e1-sq1', source: '1', target: 'sq_1', animated: true, style: { stroke: 'red' } },
];

export default function KnowledgeGraphViewer() {
  return (
    <div className="w-full h-full bg-slate-50 relative">
      <ReactFlow nodes={initialNodes} edges={initialEdges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
