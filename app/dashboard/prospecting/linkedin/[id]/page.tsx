"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/app/lib/supabase";
import BrandLoader from "@/app/components/BrandLoader";

// The LinkedIn action types available in the palette
const ACTIONS = [
  { type: "view", label: "View Profile", icon: "👁️", color: "#0080D0" },
  { type: "connect", label: "Connect", icon: "🤝", color: "#123B78" },
  { type: "message", label: "Message", icon: "💬", color: "#059669" },
  { type: "follow", label: "Follow", icon: "➕", color: "#7c3aed" },
  { type: "like", label: "Like Post", icon: "👍", color: "#d97706" },
  { type: "wait", label: "Wait", icon: "⏳", color: "#71717a" },
  { type: "branch", label: "If Accepted / Replied", icon: "🔀", color: "#e11d48" },
];
const actionMeta = (t: string) => ACTIONS.find((a) => a.type === t) || ACTIONS[0];

export default function LinkedInCanvasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [name, setName] = useState("");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Node | null>(null);

  // Load flow
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("linkedin_flows").select("*").eq("id", id).single();
      if (data) {
        setName(data.name);
        setNodes((data.nodes as Node[]) || []);
        setEdges((data.edges as Edge[]) || []);
      }
      setLoading(false);
    })();
  }, [id]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((conn: Connection) => setEdges((eds) => addEdge({ ...conn, animated: true }, eds)), []);

  const addNode = (type: string) => {
    const meta = actionMeta(type);
    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: "default",
      position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 90 },
      data: { label: `${meta.icon} ${meta.label}`, actionType: type, config: {} },
      style: {
        borderRadius: 10, border: `2px solid ${meta.color}`, padding: "8px 14px",
        fontSize: 13, fontWeight: 600, background: "white", color: "#18181b", width: 180,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const save = async () => {
    setSaving(true);
    await supabase.from("linkedin_flows").update({ nodes, edges, updated_at: new Date().toISOString() }).eq("id", id);
    setSaving(false);
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => setSelected(node);

  const updateNodeConfig = (key: string, value: string) => {
    if (!selected) return;
    setNodes((nds) => nds.map((n) => n.id === selected.id ? { ...n, data: { ...n.data, config: { ...(n.data.config as object), [key]: value } } } : n));
    setSelected((s) => s ? { ...s, data: { ...s.data, config: { ...(s.data.config as object), [key]: value } } } : s);
  };

  const deleteSelected = () => {
    if (!selected) return;
    setNodes((nds) => nds.filter((n) => n.id !== selected.id));
    setEdges((eds) => eds.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelected(null);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-zinc-50"><BrandLoader label="Loading canvas..." /></div>;

  const selectedType = selected ? (selected.data.actionType as string) : "";
  const selectedConfig = selected ? (selected.data.config as Record<string, string>) || {} : {};

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] bg-zinc-50">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/prospecting/linkedin" className="text-sm text-zinc-500 hover:text-zinc-900">← Flows</Link>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => supabase.from("linkedin_flows").update({ name }).eq("id", id)} className="text-lg font-semibold text-zinc-900 border-none focus:outline-none bg-transparent" />
        </div>
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50">{saving ? "Saving..." : "Save Flow"}</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Palette */}
        <div className="w-48 border-r border-zinc-200 bg-white p-3 overflow-y-auto">
          <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">Actions</h4>
          <div className="space-y-2">
            {ACTIONS.map((a) => (
              <button key={a.type} onClick={() => addNode(a.type)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50 transition text-left" style={{ borderLeftColor: a.color, borderLeftWidth: 3 }}>
                <span>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-zinc-400 mt-3">Click to add. Drag nodes on the canvas; drag from a node&apos;s edge to connect.</p>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        {/* Config panel */}
        {selected && (
          <div className="w-72 border-l border-zinc-200 bg-white p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-zinc-900">{actionMeta(selectedType).icon} {actionMeta(selectedType).label}</h4>
              <button onClick={() => setSelected(null)} className="text-zinc-400 hover:text-zinc-900">✕</button>
            </div>

            {selectedType === "message" && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Message</label>
                <textarea value={selectedConfig.message || ""} onChange={(e) => updateNodeConfig("message", e.target.value)} rows={5} placeholder="Hi {first_name}, ..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            {selectedType === "connect" && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Connection note (optional)</label>
                <textarea value={selectedConfig.note || ""} onChange={(e) => updateNodeConfig("note", e.target.value)} rows={4} placeholder="Optional note with the request..." className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            {selectedType === "wait" && (
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Wait (days)</label>
                <input type="number" min={0} value={selectedConfig.days || ""} onChange={(e) => updateNodeConfig("days", e.target.value)} className="w-24 px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            {(selectedType === "view" || selectedType === "follow" || selectedType === "like" || selectedType === "branch") && (
              <p className="text-sm text-zinc-500">No settings needed for this action.</p>
            )}

            <button onClick={deleteSelected} className="mt-4 text-sm text-red-500 hover:underline">Delete this step</button>
          </div>
        )}
      </div>
    </div>
  );
}