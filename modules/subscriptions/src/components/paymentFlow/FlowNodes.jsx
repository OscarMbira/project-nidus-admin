import { Handle, Position } from '@xyflow/react'

function nodeClass(active, dimmed, extra = '') {
  const base = dimmed ? 'opacity-20' : ''
  const state = active ? 'border-green-600 bg-green-950/40' : 'border-gray-600 bg-gray-900/60'
  return `rounded-lg border px-3 py-2 text-xs shadow ${state} ${base} ${extra}`
}

export function RegionNode({ data }) {
  return (
    <div className={nodeClass(true, data.dimmed, 'min-w-[140px] font-semibold text-gray-100')}>
      <Handle type="source" position={Position.Right} className="!bg-gray-500" />
      {data.label}
    </div>
  )
}

export function MethodNode({ data }) {
  return (
    <div className={nodeClass(data.enabled, data.dimmed, 'min-w-[160px] text-gray-200')}>
      <Handle type="target" position={Position.Left} className="!bg-gray-500" />
      <Handle type="source" position={Position.Right} className="!bg-gray-500" />
      {data.label}
    </div>
  )
}

export function GatewayNode({ data }) {
  const inactive = !data.active
  return (
    <div
      className={nodeClass(data.active, data.dimmed, `min-w-[140px] font-medium ${inactive ? 'border-red-700 bg-red-950/30' : ''}`)}
      style={{ borderColor: data.active ? data.color : undefined }}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-500" />
      [{data.label}]
      {!data.active && <span className="ml-1 text-red-400">⚠</span>}
    </div>
  )
}

export const flowNodeTypes = {
  region: RegionNode,
  method: MethodNode,
  gateway: GatewayNode,
}
