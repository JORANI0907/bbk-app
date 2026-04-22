'use client'

import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { AgentNodeData } from '@/lib/agent-graph-data'
import { TYPE_COLORS } from '@/lib/agent-graph-data'

export type AgentFlowNode = Node<AgentNodeData, 'agentNode'>

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps<AgentFlowNode>) {
  const isActive = data.status === 'active'
  const typeColor = TYPE_COLORS[data.agentType] ?? 'bg-gray-100 text-gray-700 border-gray-200'

  return (
    <div
      className={`
        relative bg-white rounded-2xl border-2 shadow-sm transition-all duration-300 min-w-[140px]
        ${isActive ? 'border-green-400 shadow-green-100 shadow-md' : 'border-gray-200'}
        ${selected ? 'ring-2 ring-violet-400 ring-offset-1' : ''}
      `}
    >
      {/* 활성 pulse 링 */}
      {isActive && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
        </span>
      )}

      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-gray-300 !border-gray-400" />

      <div className="p-3">
        {/* 아이콘 + 이름 */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xl leading-none">{data.icon}</span>
          <span className="text-sm font-bold text-gray-900 truncate">{data.displayName}</span>
        </div>

        {/* 역할 */}
        <p className="text-[10px] text-gray-500 leading-tight mb-2">{data.role}</p>

        {/* 타입 뱃지 + 오늘 실행 수 */}
        <div className="flex items-center justify-between gap-1">
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${typeColor}`}>
            {data.agentType}
          </span>
          {data.todayCount > 0 && (
            <span className="text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
              오늘 {data.todayCount}회
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-gray-300 !border-gray-400" />
    </div>
  )
})
