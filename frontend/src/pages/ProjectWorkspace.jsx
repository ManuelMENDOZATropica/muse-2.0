import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Send, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import NetworkMap from '../components/NetworkMap';
import { useAuth } from '../context/AuthContext';
import UserColorPicker from '../components/UserColorPicker';
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
  const [colorVersion, setColorVersion] = useState(0);
  const [chatWidth, setChatWidth] = useState(400); // For resizable sidebar
  const [connectingNode, setConnectingNode] = useState(null);
  const [museMode, setMuseMode] = useState('exploracion');
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

    // Setup Socket
    const socket = io(API_URL);
    socketRef.current = socket;
    socket.emit('join_project', id);

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
  }, [id, mergeGraph]);

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
    if (!connectingNode && node.data?.url) {
      window.open(node.data.url, '_blank', 'noopener,noreferrer');
      return;
    }

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
    }
  }, [connectingNode, id, mergeGraph]);

  if (!project) return (
    <div className="h-screen flex items-center justify-center text-gray-500">Loading Workspace...</div>
  );

  return (
    <div className="h-screen flex flex-col bg-transparent" onClick={() => setMenu(null)}>
      {/* Header */}
      <header className="h-16 border-b-[0.5px] border-white/20 flex items-center px-6 shrink-0 bg-black/40 backdrop-blur-md z-10">
        <Link to="/" className="text-gray-400 hover:text-cyan-400 transition-colors flex items-center gap-2 uppercase tracking-widest text-[10px]">
          <ArrowLeft size={14} /> DASHBOARD
        </Link>
        <div className="mx-auto flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(0,210,255,0.8)]" />
          <h1 className="uppercase tracking-[0.2em] text-xs font-bold text-white">{project.title}</h1>
        </div>
        {/* User color picker — top right */}
        <UserColorPicker
          user={user}
          onColorChange={() => setColorVersion(v => v + 1)}
        />
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat */}
        <div style={{ width: chatWidth }} className="shrink-0 border-r-[0.5px] border-white/20 flex flex-col bg-black/80 backdrop-blur-xl relative">
          {/* Drag Handle */}
          <div 
            onMouseDown={startDrag} 
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cyan-400/50 z-50 transition-colors"
          ></div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-center text-gray-500 mt-10 uppercase tracking-widest text-[10px]">
                SYSTEM READY. START EXPLORING.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-4 text-[13px] leading-relaxed relative group ${
                  m.role === 'user'
                    ? 'bg-transparent border-[0.5px] border-white/40 text-white font-mono tracking-wider'
                    : 'bg-cyan-400/[0.02] border-[0.5px] border-cyan-400/30 text-white font-sans'
                }`}>
                  <div className="absolute top-0 right-0 w-1.5 h-1.5 border-t-[0.5px] border-r-[0.5px] border-white/40 m-1 opacity-50"></div>
                  <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b-[0.5px] border-l-[0.5px] border-white/40 m-1 opacity-50"></div>
                  
                  {m.role === 'user'
                    ? <div className="whitespace-pre-wrap">{m.content}</div>
                    : <div className="[&>p]:mb-4 [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:mb-4 [&>strong]:text-cyan-400 [&>strong]:tracking-widest [&>strong]:uppercase">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                  }
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-transparent border-[0.5px] border-cyan-400/50 px-5 py-3 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-4 border-t-[0.5px] border-white/20 flex flex-col gap-3 bg-black">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">MODE:</span>
              <select 
                value={museMode} 
                onChange={e => setMuseMode(e.target.value)}
                className="bg-transparent border-[0.5px] border-white/20 text-[10px] uppercase tracking-widest text-white px-2 py-1.5 outline-none focus:border-cyan-400 cursor-pointer appearance-none"
              >
                <option value="exploracion">EXPLORATION</option>
                <option value="confrontacion">CONFRONTATION</option>
                <option value="polinizacion">POLLINATION</option>
                <option value="escalabilidad">SCALABILITY</option>
                <option value="aterrizaje">LANDING</option>
              </select>
            </div>
            <form onSubmit={handleSend} className="relative">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (input.trim()) handleSend(e); } }}
                placeholder="INPUT DATA (SHIFT+ENTER FOR NEW LINE)..."
                className="w-full bg-transparent border-b-[0.5px] border-white/20 pl-0 pr-12 py-3 text-xs uppercase tracking-widest text-white focus:outline-none focus:border-cyan-400 transition-all resize-none placeholder:text-white/20"
                rows="2"
              />
              <button disabled={isTyping || !input.trim()} type="submit"
                className="absolute right-0 top-1/2 -translate-y-1/2 p-2 text-white/40 hover:text-cyan-400 disabled:opacity-50">
                <Send size={16} />
              </button>
            </form>
          </div>
        </div>

        {/* p5 Map */}
        <div className="flex-1 relative overflow-hidden">
          {/* Connection Banner */}
          {connectingNode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-cyan-400 text-black px-6 py-2 border-[0.5px] border-white shadow-[0_0_15px_rgba(0,210,255,0.5)] z-20 text-[10px] uppercase tracking-widest font-bold flex items-center gap-4">
              <span>AWAITING CONNECTION TO "{connectingNode.label}"...</span>
              <button onClick={() => setConnectingNode(null)} className="underline opacity-60 hover:opacity-100">ABORT</button>
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
          />

          {/* Context menu */}
          {menu && (
            <div
              className="fixed z-50 bg-black border-[0.5px] border-cyan-400 shadow-[0_0_15px_rgba(0,210,255,0.15)] py-2 w-56 flex flex-col"
              style={{ top: menu.y, left: menu.x }}
              onClick={e => e.stopPropagation()}
            >
              <div className="px-4 py-2 border-b-[0.5px] border-white/20 text-[10px] text-cyan-400 font-bold uppercase tracking-[0.2em] mb-1">
                {menu.label}
              </div>
              <button
                className="px-4 py-3 text-[10px] uppercase tracking-widest text-left text-gray-400 hover:bg-cyan-400/10 hover:text-cyan-400 transition-colors flex items-center gap-3"
                onClick={() => handleExpand(menu.id, menu.label, 'related')}
              >
                <div className="w-1.5 h-1.5 border border-cyan-400" /> EXPLORE PARALLELS
              </button>
              <button
                className="px-4 py-3 text-[10px] uppercase tracking-widest text-left text-gray-400 hover:bg-cyan-400/10 hover:text-cyan-400 transition-colors flex items-center gap-3"
                onClick={() => { 
                  const nObj = nodes.find(n => n.id === menu.id);
                  setConnectingNode({ id: menu.id, label: menu.label, x: nObj?.position?.x || 0, y: nObj?.position?.y || 0 }); 
                  setMenu(null); 
                }}
              >
                <div className="w-1.5 h-1.5 bg-cyan-400" /> ESTABLISH LINK
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
