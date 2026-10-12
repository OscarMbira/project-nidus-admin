import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import {
  PermissionGate,
  fetchCountries,
  listPaymentGateways,
  listRoutingRules,
  useCurrentAdmin,
} from '@nidus-admin/shared'
import { AdminCard, EmptyState, LoadingState, SelectField } from '@nidus-admin/ui'
import { buildFlowGraph } from '../components/paymentFlow/buildFlowGraph.js'
import { flowNodeTypes } from '../components/paymentFlow/FlowNodes.jsx'

const edgeStyles = {
  primary: { stroke: '#22c55e', strokeWidth: 2 },
  fallback: { stroke: '#f97316', strokeWidth: 2, strokeDasharray: '6 4' },
  inactive: { stroke: '#6b7280', strokeWidth: 1 },
}

export default function PaymentFlowPage() {
  const navigate = useNavigate()
  const { role } = useCurrentAdmin()
  const flowRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState([])
  const [gateways, setGateways] = useState([])
  const [countries, setCountries] = useState([])
  const [showInactive, setShowInactive] = useState(true)
  const [showFallback, setShowFallback] = useState(true)
  const [countryCode, setCountryCode] = useState('')
  const [highlightRegion, setHighlightRegion] = useState(null)
  const [drawer, setDrawer] = useState(null)

  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  )
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  )

  useEffect(() => {
    if (role === 'support_admin') return
    ;(async () => {
      setLoading(true)
      const [rulesRes, gwRes, countriesRes] = await Promise.all([
        listRoutingRules(),
        listPaymentGateways(),
        fetchCountries({ activeOnly: true }),
      ])
      setRules(rulesRes.data || [])
      setGateways(gwRes.data || [])
      setCountries(countriesRes.data || [])
      setLoading(false)
    })()
  }, [role])

  const gatewaysById = useMemo(() => new Map(gateways.map((g) => [g.id, g])), [gateways])

  useEffect(() => {
    const { nodes: nextNodes, edges: nextEdges } = buildFlowGraph(rules, gateways, gatewaysById, {
      showInactive,
      showFallback,
      countryCode,
      highlightRegion,
    })
    setNodes(nextNodes)
    setEdges(nextEdges.map((e) => ({
      ...e,
      style: e.data?.dimmed
        ? { ...edgeStyles.inactive, opacity: 0.2 }
        : e.type === 'fallback'
          ? edgeStyles.fallback
          : e.data?.active === false
            ? edgeStyles.inactive
            : edgeStyles.primary,
      animated: e.type === 'fallback' && !e.data?.dimmed,
    })))
  }, [rules, gateways, gatewaysById, showInactive, showFallback, countryCode, highlightRegion, setNodes, setEdges])

  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'gateway') {
      setDrawer({ type: 'gateway', data: node.data.gateway })
    } else if (node.type === 'method') {
      setDrawer({ type: 'method', data: node.data.rule })
    } else if (node.type === 'region') {
      setHighlightRegion((prev) => (prev === node.data.region ? null : node.data.region))
    }
  }, [])

  const exportPng = async () => {
    if (!flowRef.current) return
    const dataUrl = await toPng(flowRef.current, { backgroundColor: '#030712' })
    const link = document.createElement('a')
    link.download = `payment-flow-${new Date().toISOString().slice(0, 10)}.png`
    link.href = dataUrl
    link.click()
  }

  if (role === 'support_admin') {
    return (
      <div className="p-6">
        <EmptyState title="Access denied" description="Payment Flow is restricted to super and system administrators." />
      </div>
    )
  }

  if (loading) return <LoadingState message="Loading payment flow diagram..." />

  return (
    <PermissionGate permission="billing.payment_config.view">
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-100">Payment Flow</h1>
            <p className="text-sm text-gray-500">Live routing architecture from payment method routing config</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <SelectField
              value={countryCode}
              onChange={setCountryCode}
              placeholder="All countries"
              searchPlaceholder="Search country..."
              forceSearchable
              options={[
                { value: '', label: 'All countries' },
                ...countries.map((c) => ({
                  value: c.country_code,
                  label: `${c.country_code} — ${c.country_name}`,
                })),
              ]}
            />
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show inactive
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={showFallback} onChange={(e) => setShowFallback(e.target.checked)} />
              Show fallback
            </label>
            <button type="button" onClick={exportPng} className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">
              Export PNG
            </button>
          </div>
        </div>

        <div ref={flowRef} className="h-[600px] rounded-lg border border-gray-700 bg-gray-950">
          {nodes.length === 0 ? (
            <EmptyState title="No routing rules" description="Configure method routing to populate this diagram." />
          ) : (
            <ReactFlowProvider>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={flowNodeTypes}
                onNodeClick={onNodeClick}
                fitView
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#374151" gap={20} />
                <Controls />
                <MiniMap nodeColor="#1f2937" maskColor="rgba(0,0,0,0.6)" />
              </ReactFlow>
            </ReactFlowProvider>
          )}
        </div>

        {drawer && (
          <AdminCard title={drawer.type === 'gateway' ? 'Gateway Details' : 'Routing Rule'}>
            {drawer.type === 'gateway' ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Name</dt><dd>{drawer.data.display_name}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Environment</dt><dd>{drawer.data.environment}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd>{drawer.data.is_active ? 'Active' : 'Inactive'}</dd></div>
                <button
                  type="button"
                  onClick={() => navigate(`/subscriptions/payment-gateways?id=${drawer.data.id}`)}
                  className="mt-3 text-xs text-cyan-400 hover:underline"
                >
                  Open gateway list →
                </button>
              </dl>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-gray-500">Label</dt><dd>{drawer.data.display_label}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Primary</dt><dd>{drawer.data.primary_gateway_name}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Fallback</dt><dd>{drawer.data.fallback_gateway_name || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-500">Countries</dt><dd>{drawer.data.supported_countries?.join(', ') || 'All in region'}</dd></div>
              </dl>
            )}
            <button type="button" onClick={() => setDrawer(null)} className="mt-4 text-xs text-gray-400 hover:text-gray-200">Close</button>
          </AdminCard>
        )}
      </div>
    </PermissionGate>
  )
}
