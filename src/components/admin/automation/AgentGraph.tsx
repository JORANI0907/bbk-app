'use client'

import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { AgentNode, type AgentFlowNode } from './AgentNode'
import {
  AGENT_DEFINITIONS,
  AGENT_EDGE_PAIRS,
  type AgentNodeData,
} from '@/lib/agent-graph-data'

const NODE_TYPES: NodeTypes = { agentNode: AgentNode as NodeTypes['agentNode'] }

const LAYOUT: Record<string, { x: number; y: number }> = {
  'bbk-lead':        { x: 320, y: 20  },
  'bbk-developer':   { x: 0,   y: 180 },
  'bbk-designer':    { x: 160, y: 180 },
  'bbk-tester':      { x: 320, y: 180 },
  'bbk-deployer':    { x: 480, y: 180 },
  'bbk-mkt-leader':  { x: 640, y: 180 },
  'bbk-mkt-mkt':     { x: 480, y: 340 },
  'bbk-mkt-dsn':     { x: 640, y: 340 },
  'bbk-mkt-str':     { x: 800, y: 340 },
  'bbk-mkt-insta':   { x: 960, y: 340 },
}

interface AgentGraphProps {
  activeSessions: Set<string>
  todayCounts: Record<string, number>
  onNodeClick?: (agentId: string) => void
}

export function AgentGraph({ activeSessions, todayCounts, onNodeClick }: AgentGraphProps) {
  const initialNodes: AgentFlowNode[] = useMemo(() =>
    AGENT_DEFINITIONS.map((def) => ({
      id: def.agentId,
      type: 'agentNode' as const,
      position: LAYOUT[def.agentId] ?? { x: 0, y: 0 },
      data: {
        ...def,
        status: activeSessions.has(def.agentId) ? ('active' as const) : ('idle' as const),
        todayCount: todayCounts[def.agentId] ?? 0,
      } satisfies AgentNodeData,
    })),
  [activeSessions, todayCounts])

  const initialEdges = useMemo(() =>
    AGENT_EDGE_PAIRS.map((pair, i) => {
      const isActive = activeSessions.has(pair.source) || activeSessions.has(pair.target)
      return {
        id: `e-${i}`,
        source: pair.source,
        target: pair.target,
        label: pair.label,
        type: 'smoothstep',
        animated: isActive,
        style: {
          stroke: isActive ? '#22c55e' : '#d1d5db',
          strokeWidth: isActive ? 2 : 1,
        },
        labelStyle: { fontSize: 10, fill: '#6b7280' },
        labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
      }
    }),
  [activeSessions])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div className="w-full h-[420px] rounded-2xl border border-gray-200 overflow-hidden bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#e5e7eb" />
        <Controls showInteractive={false} className="!border-gray-200 !shadow-sm" />
        <MiniMap
          nodeColor={(node) => {
            const d = node.data as unknown as AgentNodeData
            return d.status === 'active' ? '#22c55e' : '#d1d5db'
          }}
          className="!border-gray-200 !shadow-sm !rounded-xl"
          zoomable
          pannable
        />
      </ReactFlow>
    </div>
  )
}
