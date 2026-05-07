import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Loader2, X, ExternalLink, Sparkles, MessageSquare, ChevronLeft, ChevronRight, Maximize2, Minimize2, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import NetworkMap from '../components/NetworkMap';
import { useAuth } from '../context/AuthContext';
import UsersLegend from '../components/UserColorPicker';
import { io } from 'socket.io-client';

const EDGE_STYLE = { stroke: '#475569' };

const API_URL = import.meta.env.VITE_API_URL || 'https://muse-2-0.onrender.com';

function edgeStyled(color) { return { stroke: color }; }

function mergeDegrees(nodes, edges) {
  const deg = {};
  nodes.forEach(n => { deg[n.id] = 0; });
  edges.forEach(e => {
    if (deg[e.source] !== undefined) deg[e.source]++;
    if (deg[e.target] !== undefined) deg[e.target]++;
  });
  return nodes.map(n => ({ ...n, data: { ...n.data, degree: deg[n.id] ?? 0 } }));
}

export default function ProjectWorkspace() {
  const { id } = useParams();
  const { user } = useAuth();
  const [project,  setProject]  = useState(null);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [menu,     setMenu]     = useState(null);
  const [nodes,    setNodes]    = useState([]);
  const [edges,    setEdges]    = useState([]);
  const [colorVersion] = useState(0);
  const [chatWidth, setChatWidth] = useState(400);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [connectingNode, setConnectingNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeModal, setNodeModal] = useState(null);
  const [museMode, setMuseMode] = useState('exploracion');
  const [activeUsers, setActiveUsers] = useState([]); // presence
  const [showOnboarding, setShowOnboarding] = useState(false);
  const exportRef = useRef(null); // callback from NetworkMap
  const isDraggingSidebar = useRef(false);
  const messagesEndRef = useRef(null);

  // live refs for callbacks
  const nodesRef = useRef([]); useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef([]); useEffect(() => { edgesRef.current = edges; }, [edges]);
  const socketRef = useRef(null);

  /* ── merge graph data helper ── */
  const mergeGraph = useCallback((graphData, edgeColor = '#475569') => {
    const curN = nodesRef.current;
    const curE = edgesRef.current;
    const existN = new Set(curN.map(n => n.id));
    const existE = new Set(curE.map(e => e.id));

    const newN = (graphData.newNodes || []).filter(n => !existN.has(n.id)).map(n => ({
      id: n.id, type: 'topic',
      position: { x: n.positionX, y: n.positionY },
      createdById: n.createdById || null,
      data: { label: n.label },
    }));
    const newE = (graphData.newEdges || []).filter(e => !existE.has(e.id)).map(e => ({
      id: e.id, source: e.sourceId, target: e.targetId,
      style: edgeStyled(edgeColor),
    }));

    if (!newN.length && !newE.length) return;
    const allN = [...curN, ...newN];
    const allE = [...curE, ...newE];
    setNodes(mergeDegrees(allN, allE));
    setEdges(allE);
  }, []);

  /* ── load and setup socket ── */
  useEffect(() => {
    fetch(`${API_URL}/api/projects/${id}?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        setProject(data);
        setMessages(data.messages || []);
        const n = data.nodes.map(n => ({
          id: n.id, type: n.type || 'topic',
          position: { x: n.positionX, y: n.positionY },
          createdById: n.createdById || null,
          data: { label: n.label, ...n.data },
        }));
        const e = (data.edges || []).map(e => ({
          id: e.id, source: e.sourceId, target: e.targetId, style: EDGE_STYLE,
        }));
        setNodes(mergeDegrees(n, e));
        setEdges(e);
      });

    // Setup Socket
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join_project', {
      projectId: id,
      userId: user?.id,
      userName: user?.name,
      userAvatar: user?.avatar,
    });

    // Presence
    socket.on('presence_list', (members) => setActiveUsers(members));
    socket.on('user_presence', (data) => {
      if (data.type === 'join') {
        setActiveUsers(prev => [
          ...prev.filter(u => u.userId !== data.userId),
          { userId: data.userId, userName: data.userName, userAvatar: data.userAvatar }
        ]);
      } else {
        setActiveUsers(prev => prev.filter(u => u.userId !== data.userId));
      }
    });

    socket.on('project_updated', (data) => {
      if (data.newMessages && data.newMessages.length) {
        setMessages(prev => {
          const existIds = new Set(prev.map(m => m.id));
          const toAdd = data.newMessages.filter(m => !existIds.has(m.id));
          return [...prev, ...toAdd];
        });
        setIsTyping(false);
      }
      if ((data.newNodes && data.newNodes.length) || (data.newEdges && data.newEdges.length)) {
        mergeGraph(data);
      }
    });

    socket.on('chat_chunk', (data) => {
      setMessages(prev => {
        let existingIndex = prev.findIndex(m => m.id === data.messageId || m.id === data.tempId);
        if (existingIndex !== -1) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], id: data.messageId, content: data.content };
          return next;
        } else {
          return [...prev, { id: data.messageId, role: data.role, content: data.content }];
        }
      });
      if (data.isDone && data.role === 'assistant') {
        setIsTyping(false);
      }
    });

    socket.on('trigger_extraction', (data) => {
      if (data?.userId === user?.id) {
        fetch(`${API_URL}/api/projects/${id}/extract-graph`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user?.id }),
        }).then(r => r.json()).then(g => mergeGraph(g)).catch(console.error);
      }
    });

    socket.on('node_moved', (data) => {
      setNodes(prev => prev.map(n => 
        n.id === data.nodeId 
          ? { ...n, position: { x: data.positionX, y: data.positionY }, data: { ...n.data, isPinned: data.isPinned } } 
          : n
      ));
    });

    return () => socket.disconnect();
  }, [id, mergeGraph, user]);

  // Show onboarding for empty projects after 1.5s
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => {
      if (nodes.length === 0 && messages.length === 0) setShowOnboarding(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [project, nodes.length, messages.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setMenu(null); setSelectedNode(null); setNodeModal(null);
        setConnectingNode(null); setPresentationMode(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setPresentationMode(v => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault();
        exportRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  /* ── expand node ── */
  const handleExpand = async (nodeId, nodeLabel, relationType) => {
    setMenu(null); setIsTyping(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${id}/expand-node`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, nodeLabel, relationType }),
      });
      mergeGraph(await res.json(), relationType === 'related' ? '#7c3aed' : '#ea580c');
    } catch(e) { console.error(e); }
    finally { setIsTyping(false); }
  };

  /* ── chat ── */
  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setIsTyping(true);
    socketRef.current.emit('send_chat', { projectId: id, content: input, userId: user?.id, mode: museMode });
    setInput('');
  };

  /* ── Resize Sidebar ── */
  const startDrag = () => { isDraggingSidebar.current = true; };
  const stopDrag = () => { isDraggingSidebar.current = false; };
  const onDrag = (e) => {
    if (isDraggingSidebar.current) {
      if (e.clientX > 300 && e.clientX < window.innerWidth - 300) {
        setChatWidth(e.clientX);
      }
    }
  };
  useEffect(() => {
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    return () => {
      document.removeEventListener('mousemove', onDrag);
      document.removeEventListener('mouseup', stopDrag);
    };
  }, []);

  /* ── Handle Node Movement Emit ── */
  const handleNodeMove = useCallback((nodeId, x, y) => {
    // update local state
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, position: { x, y }, data: { ...n.data, isPinned: true } } : n));
    // emit to server
    if (socketRef.current) {
      socketRef.current.emit('node_moved', { projectId: id, nodeId, positionX: x, positionY: y, isPinned: true });
    }
  }, [id]);

  /* ── Handle Node Click ── */
  const handleNodeClick = useCallback(async (node) => {
    if (connectingNode) {
      if (connectingNode.id !== node.id) {
        setIsTyping(true);
        const nodeA = connectingNode;
        const nodeB = { id: node.id, label: node.label, x: node.x, y: node.y };
        setConnectingNode(null);
        try {
          const res = await fetch(`${API_URL}/api/projects/${id}/connect-nodes`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nodeA, nodeB }),
          });
          mergeGraph(await res.json(), '#10b981');
        } catch(e) { console.error(e); }
        finally { setIsTyping(false); }
      } else {
        setConnectingNode(null);
      }
      return;
    }

    // MAGNUM nodes (from research doc) — show url/description modal
    if (node.data?.isMagnum && (node.data?.url || node.data?.description)) {
      setSelectedNode(node);
      return;
    }

    // Chat-generated nodes — fetch AI summary + origin messages
    if (!node.data?.isMagnum) {
      setNodeModal({ label: node.label, loading: true });
      try {
        const res = await fetch(`${API_URL}/api/nodes/${node.id}/summary`);
        const data = await res.json();
        setNodeModal({ ...data, loading: false });
      } catch(e) {
        setNodeModal({ label: node.label, aiSummary: 'No se pudo generar el resumen.', originMessages: [], loading: false });
      }
    }
  }, [connectingNode, id, mergeGraph]);

  if (!project) return (
    <div className="h-screen flex items-center justify-center text-gray-500">Loading Workspace...</div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#0A0A0A]" onClick={() => setMenu(null)}>
      {/* Header */}
      <header className="h-16 border-b border-white/[0.08] flex items-center px-6 shrink-0 bg-black/40 backdrop-blur-xl z-10">
        <Link to="/" className="text-[#A1A1AA] hover:text-white transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="mx-auto flex items-center gap-3 bg-white/[0.04] border border-white/[0.08] px-4 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
          <h1 className="text-sm font-medium text-[#E4E4E7]">{project.title}</h1>
        </div>
        {/* Right: active users + tools */}
        <div className="flex items-center gap-2">
          {/* Active users */}
          {activeUsers.length > 0 && (
            <div className="flex items-center -space-x-1.5 mr-1">
              {activeUsers.slice(0,4).map(u => (
                <img key={u.userId}
                  src={u.userAvatar || `https://ui-avatars.com/api/?name=${u.userName}&background=random`}
                  alt={u.userName} title={`${u.userName} — en vivo`}
                  className="w-6 h-6 rounded-full border-2 border-[#0A0A0A] ring-1 ring-emerald-400/40"
                />
              ))}
              <span className="ml-2.5 text-[11px] text-emerald-400 font-medium">{activeUsers.length} en vivo</span>
            </div>
          )}
          <UsersLegend nodes={nodes} />
          {/* Export */}
          <button onClick={() => exportRef.current?.()} title="Exportar mapa (Ctrl+E)"
            className="p-2 rounded-lg text-[#52525B] hover:text-white hover:bg-white/[0.05] transition-colors">
            <Download size={15} />
          </button>
          {/* Presentation mode */}
          <button onClick={() => setPresentationMode(v => !v)} title="Modo presentación (Ctrl+P)"
            className={`p-2 rounded-lg transition-colors ${
              presentationMode ? 'text-white bg-white/[0.08]' : 'text-[#52525B] hover:text-white hover:bg-white/[0.05]'
            }`}>
            {presentationMode ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          {/* Chat collapse */}
          <button onClick={() => setChatCollapsed(v => !v)} title={chatCollapsed ? 'Mostrar chat' : 'Ocultar chat'}
            className="p-2 rounded-lg text-[#52525B] hover:text-white hover:bg-white/[0.05] transition-colors">
            {chatCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat sidebar — collapsible */}
        {!presentationMode && (
          <div
            style={{ width: chatCollapsed ? 0 : chatWidth, minWidth: chatCollapsed ? 0 : 280 }}
            className="shrink-0 border-r border-white/[0.08] flex flex-col bg-[#0A0A0A] relative overflow-hidden transition-all duration-300"
          >
            {/* Drag Handle */}
            {!chatCollapsed && (
              <div onMouseDown={startDrag}
                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-white/20 z-50 transition-colors" />
            )}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.length === 0 && (
                <div className="text-center text-[#52525B] mt-12 space-y-2">
                  <p className="text-sm">Comienza escribiendo una idea.</p>
                  <p className="text-xs">Shift+Enter para nueva línea, Enter para enviar.</p>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-5 py-3.5 text-[14px] leading-relaxed shadow-sm ${
                    m.role === 'user'
                      ? 'bg-[#27272A] text-[#FAFAFA] rounded-br-sm'
                      : 'bg-white/[0.03] border border-white/[0.08] text-[#E4E4E7] rounded-bl-sm'
                  }`}>
                    {m.role === 'user'
                      ? <div className="whitespace-pre-wrap">{m.content}</div>
                      : <div className="[&>p]:mb-4 [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:mb-4 [&>strong]:text-white [&>strong]:font-semibold">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                    }
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl rounded-bl-sm px-5 py-3">
                    <Loader2 className="w-4 h-4 animate-spin text-[#A1A1AA]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="p-4 border-t border-white/[0.08] flex flex-col gap-3 bg-[#0A0A0A]">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-[#A1A1AA] font-medium">Modo:</span>
                <select value={museMode} onChange={e => setMuseMode(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.08] rounded-md text-xs text-[#E4E4E7] px-2 py-1.5 outline-none focus:border-white/20 cursor-pointer">
                  <option value="exploracion" title="Preguntas que rompen bloqueos">🌋 Exploración</option>
                  <option value="confrontacion" title="Abogado del diablo — pone a prueba la idea">⚔️ Confrontación</option>
                  <option value="polinizacion" title="Fusiones improbables entre conceptos">🧬 Polinización</option>
                  <option value="escalabilidad" title="Desafía a expandir la idea">🌐 Escalabilidad</option>
                  <option value="aterrizaje" title="Baja la idea a la realidad">🛬 Aterrizaje</option>
                </select>
              </div>
              <form onSubmit={handleSend} className="relative">
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) handleSend(e); } }}
                  placeholder="Escribe tu idea... (Enter para enviar)"
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl pl-4 pr-12 py-3 text-sm text-[#E4E4E7] focus:outline-none focus:border-white/30 transition-all resize-none placeholder:text-[#3F3F46]"
                  rows="2"
                />
                <button disabled={isTyping || !input.trim()} type="submit"
                  title="Enviar (Enter)"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#A1A1AA] hover:text-white disabled:opacity-30 transition-colors">
                  <Send size={16} />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Map area */}
        <div className="flex-1 relative overflow-hidden">
          {/* Onboarding overlay */}
          {showOnboarding && nodes.length === 0 && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              <div className="text-center space-y-6 max-w-sm">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  <Sparkles size={22} className="text-[#52525B]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#A1A1AA] mb-2">El mapa está vacío</h2>
                  <p className="text-sm text-[#52525B] leading-relaxed">
                    Escribe una primera idea en el chat →<br />
                    Muse la convertirá en nodos aquí.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  {[
                    { step: '1', label: 'Escribe una idea' },
                    { step: '2', label: 'Muse pregunta' },
                    { step: '3', label: 'El mapa crece' },
                  ].map(s => (
                    <div key={s.step} className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3">
                      <div className="text-xs font-bold text-[#3F3F46] mb-1">{s.step}</div>
                      <div className="text-[11px] text-[#52525B]">{s.label}</div>
                    </div>
                  ))}
                </div>
                <button
                  className="pointer-events-auto text-xs text-[#3F3F46] hover:text-[#71717A] transition-colors underline"
                  onClick={() => setShowOnboarding(false)}
                >Entendido, cerrar</button>
              </div>
            </div>
          )}
          {/* Connection Banner */}
          {connectingNode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-500/20 text-blue-300 border border-blue-500/30 backdrop-blur-md px-5 py-2 rounded-full shadow-2xl z-20 text-sm font-medium animate-pulse flex items-center gap-3">
              <span>Selecciona otro nodo para conectar con "{connectingNode.label}"...</span>
              <button onClick={() => setConnectingNode(null)} className="underline opacity-80 hover:opacity-100 text-xs">Cancelar</button>
            </div>
          )}

          <NetworkMap
            nodes={nodes}
            edges={edges}
            onNodeClick={handleNodeClick}
            onNodeRightClick={(node, x, y) => setMenu({ id: node.id, label: node.label, x, y })}
            onNodeMove={handleNodeMove}
            currentUserId={user?.id}
            colorVersion={colorVersion}
            onExportReady={(fn) => { exportRef.current = fn; }}
          />

          {/* Context menu */}
          {menu && (
            <div
              className="fixed z-50 bg-[#18181B] border border-white/[0.08] rounded-xl shadow-2xl py-2 w-56 flex flex-col overflow-hidden"
              style={{ top: menu.y, left: menu.x }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-2 border-b border-white/[0.04] text-xs text-[#A1A1AA] font-semibold mb-1 truncate">
                {menu.label}
              </div>
              <button
                className="px-4 py-2.5 text-sm text-left text-[#E4E4E7] hover:bg-white/[0.04] transition-colors flex items-center gap-3"
                onClick={() => handleExpand(menu.id, menu.label, 'related')}
              >
                <div className="w-2 h-2 rounded-full bg-purple-500" /> Ver similares
              </button>
              <button
                className="px-4 py-2.5 text-sm text-left text-[#E4E4E7] hover:bg-white/[0.04] transition-colors flex items-center gap-3"
                onClick={() => { 
                  const nObj = nodes.find(n => n.id === menu.id);
                  setConnectingNode({ id: menu.id, label: menu.label, x: nObj?.position?.x || 0, y: nObj?.position?.y || 0 }); 
                  setMenu(null); 
                }}
              >
                <div className="w-2 h-2 rounded-full bg-blue-500" /> Conectar nodos
              </button>
            </div>
          )}

          {/* MAGNUM Node Info Modal (url/description) */}
          {selectedNode && (
            <div className="absolute bottom-6 right-6 w-80 bg-[#18181B]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl p-5 z-40">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-[#FAFAFA] pr-4">{selectedNode.label}</h3>
                <button onClick={() => setSelectedNode(null)} className="text-[#A1A1AA] hover:text-white p-1 rounded-full hover:bg-white/[0.05]">
                  <X size={16} />
                </button>
              </div>
              {selectedNode.data?.description && (
                <p className="text-sm text-[#A1A1AA] mb-4 leading-relaxed">{selectedNode.data.description}</p>
              )}
              {selectedNode.data?.url && (
                <a href={selectedNode.data.url} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center gap-2 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 px-3 py-1.5 rounded-full transition-colors">
                  <ExternalLink size={14} /> Visitar Enlace
                </a>
              )}
            </div>
          )}

          {/* Chat-node Modal (AI summary + origin messages) */}
          {nodeModal && (
            <div className="absolute bottom-6 right-6 w-96 max-h-[70vh] bg-[#18181B]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex justify-between items-center px-5 py-4 border-b border-white/[0.06] shrink-0">
                <h3 className="font-semibold text-[#FAFAFA] text-sm truncate pr-4">{nodeModal.label}</h3>
                <button onClick={() => setNodeModal(null)} className="text-[#A1A1AA] hover:text-white p-1 rounded-full hover:bg-white/[0.05] shrink-0">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-y-auto flex-1 p-5 space-y-4">
                {nodeModal.loading ? (
                  <div className="flex items-center gap-3 text-[#A1A1AA] text-sm">
                    <Loader2 size={16} className="animate-spin" /> Generando resumen...
                  </div>
                ) : (
                  <>
                    {/* AI Summary */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-[#A1A1AA] uppercase tracking-widest font-semibold">
                        <Sparkles size={10} /> Concepto
                      </div>
                      <p className="text-sm text-[#E4E4E7] leading-relaxed">{nodeModal.aiSummary}</p>
                    </div>

                    {/* Conversation bullets */}
                    {nodeModal.bullets?.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[10px] text-[#A1A1AA] uppercase tracking-widest font-semibold">
                          <MessageSquare size={10} /> Cómo surgió
                        </div>
                        <ul className="space-y-1.5">
                          {nodeModal.bullets.map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-[#A1A1AA] leading-relaxed">
                              <span className="text-[#52525B] mt-0.5 shrink-0">•</span>
                              <span>{b}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
