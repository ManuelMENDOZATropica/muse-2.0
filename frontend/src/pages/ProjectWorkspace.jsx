import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import NetworkMap from '../components/NetworkMap';
import { useAuth } from '../context/AuthContext';
import UserColorPicker from '../components/UserColorPicker';

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
  const [colorVersion, setColorVersion] = useState(0); // bumps when user changes color
  const messagesEndRef = useRef(null);

  // live refs for callbacks
  const nodesRef = useRef([]); useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  const edgesRef = useRef([]); useEffect(() => { edgesRef.current = edges; }, [edges]);

  /* ── load ── */
  useEffect(() => {
    fetch(`${API_URL}/api/projects/${id}`)
      .then(r => r.json())
      .then(data => {
        setProject(data);
        setMessages(data.messages || []);
        const n = data.nodes.map(n => ({
          id: n.id, type: n.type || 'topic',
          position: { x: n.positionX, y: n.positionY },
          createdById: n.createdById || null,
          data: { label: n.label },
        }));
        const e = (data.edges || []).map(e => ({
          id: e.id, source: e.sourceId, target: e.targetId, style: EDGE_STYLE,
        }));
        setNodes(mergeDegrees(n, e));
        setEdges(e);
      });
  }, [id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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
    const userMsg = { role: 'user', content: input, id: Date.now() };
    setMessages(p => [...p, userMsg]);
    setInput(''); setIsTyping(true);
    try {
      const res = await fetch(`${API_URL}/api/projects/${id}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: userMsg.content, userId: user?.id }),
      });
      const data = await res.json();
      setMessages(p => [...p, data.message]);
      setIsTyping(false);
      fetch(`${API_URL}/api/projects/${id}/extract-graph`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      }).then(r => r.json()).then(g => mergeGraph(g)).catch(console.error);
    } catch(e) { console.error(e); setIsTyping(false); }
  };

  /* ── right-click on node ── */
  const onNodeRightClick = useCallback((node, mx, my) => {
    setMenu({ id: node.id, label: node.label, x: mx, y: my });
  }, []);

  if (!project) return (
    <div className="h-screen flex items-center justify-center text-gray-500">Loading Workspace...</div>
  );

  return (
    <div className="h-screen flex flex-col bg-[#050505]" onClick={() => setMenu(null)}>
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center px-6 shrink-0 bg-black/20 backdrop-blur-md z-10">
        <Link to="/" className="text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="mx-auto flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h1 className="font-semibold text-gray-200">{project.title}</h1>
        </div>
        {/* User color picker — top right */}
        <UserColorPicker
          user={user}
          onColorChange={() => setColorVersion(v => v + 1)}
        />
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat */}
        <div className="w-1/2 shrink-0 border-r border-white/5 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-10 text-sm">
                Welcome to Muse. Start exploring your project by typing below.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-6 py-4 text-[15px] leading-relaxed shadow-sm ${
                  m.role === 'user'
                    ? 'bg-white text-black rounded-br-sm'
                    : 'bg-[#141414] border border-white/10 text-gray-200 rounded-bl-sm'
                }`}>
                  {m.role === 'user'
                    ? <div className="whitespace-pre-wrap">{m.content}</div>
                    : <div className="[&>p]:mb-4 [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:mb-4 [&>strong]:text-purple-300">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                  }
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-white/[0.05] border border-white/10 rounded-2xl rounded-bl-sm px-5 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 border-t border-white/5">
            <form onSubmit={handleSend} className="relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) handleSend(e); } }}
                placeholder="Ask Muse (Shift+Enter for new line)..."
                className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-white focus:outline-none focus:border-purple-500 transition-all resize-none"
                rows="2"
              />
              <button disabled={isTyping || !input.trim()} type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white disabled:opacity-50">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* p5 Map */}
        <div className="flex-1 relative overflow-hidden">
          <NetworkMap
            nodes={nodes}
            edges={edges}
            onNodeRightClick={onNodeRightClick}
            currentUserId={user?.id}
            colorVersion={colorVersion}
          />

          {/* Context menu */}
          {menu && (
            <div
              className="fixed z-50 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-2 w-56 flex flex-col overflow-hidden"
              style={{ top: menu.y, left: menu.x }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-2 border-b border-white/5 text-xs text-gray-500 font-bold uppercase tracking-wider">
                "{menu.label}"
              </div>
              <button
                className="px-4 py-3 text-sm text-left text-gray-300 hover:bg-purple-500/20 hover:text-purple-300 transition-colors flex items-center gap-2"
                onClick={() => handleExpand(menu.id, menu.label, 'related')}
              >
                <div className="w-2 h-2 rounded-full bg-purple-500" /> Conceptos Relacionados
              </button>
              <button
                className="px-4 py-3 text-sm text-left text-gray-300 hover:bg-orange-500/20 hover:text-orange-300 transition-colors flex items-center gap-2"
                onClick={() => handleExpand(menu.id, menu.label, 'dissimilar')}
              >
                <div className="w-2 h-2 rounded-full bg-orange-500" /> Conceptos Disímiles
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
