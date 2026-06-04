import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import NetworkMap from '../components/NetworkMap';

/* ─── Demo users ─────────────────────────────────────────────── */
const GERA = { id: 'demo-gera', name: 'Gera', avatar: null, paletteIdx: 0 };   // Violeta
const AGUS = { id: 'demo-agus', name: 'Agus', avatar: null, paletteIdx: 2 };   // Verde

/* Inject palette into localStorage so NetworkMap can read it */
function seedPalettes() {
  localStorage.setItem(`muse_color_${GERA.id}`, String(GERA.paletteIdx));
  localStorage.setItem(`muse_color_${AGUS.id}`, String(AGUS.paletteIdx));
}

/* ─── Pre-scripted conversation ──────────────────────────────── */
const SCRIPT = [
  {
    delay: 0,
    msg: {
      role: 'user', sender: GERA,
      content: 'Estamos explorando qué significa el concepto de "Just Do It" para la Gen Z hoy. ¿Cómo ha evolucionado?'
    },
    graph: {
      nodes: [
        { id: 'n1', label: 'Just Do It', createdById: GERA.id, positionX: 0,   positionY: 0 },
        { id: 'n2', label: 'Gen Z',      createdById: GERA.id, positionX: 280, positionY: -120 },
        { id: 'n3', label: 'Identidad',  createdById: GERA.id, positionX: -260, positionY: 140 },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n1', target: 'n3' },
      ]
    }
  },
  {
    delay: 1400,
    msg: {
      role: 'assistant', sender: null,
      content: `**Just Do It** ha pasado de ser un llamado a la acción individual a convertirse en un **símbolo de autenticidad colectiva**.

Para la Gen Z, el concepto resuena en tres capas:

- 🔥 **Acción sin permiso** — hacer sin validación externa
- 🌍 **Causa + movimiento** — el "hacer" como activismo
- 🎭 **Fluidez de identidad** — hacerlo en tus propios términos

Nike ha sabido mantener el mantra vivo reinterpretándolo con atletas que rompen moldes (Serena, Colin Kaepernick, Simone Biles).`
    },
    graph: null
  },
  {
    delay: 2800,
    msg: {
      role: 'user', sender: AGUS,
      content: 'Me interesa el ángulo del activismo. ¿Cómo conecta Nike con causas sociales sin perder credibilidad de marca?'
    },
    graph: {
      nodes: [
        { id: 'n4', label: 'Activismo',     createdById: AGUS.id, positionX: 380,  positionY: 200 },
        { id: 'n5', label: 'Credibilidad',  createdById: AGUS.id, positionX: -340, positionY: -180 },
        { id: 'n6', label: 'Causa Social',  createdById: AGUS.id, positionX: 180,  positionY: 360 },
      ],
      edges: [
        { id: 'e3', source: 'n4', target: 'n5' },
        { id: 'e4', source: 'n4', target: 'n6' },
        { id: 'e5', source: 'n2', target: 'n4' },
      ]
    }
  },
  {
    delay: 4200,
    msg: {
      role: 'assistant', sender: null,
      content: `La clave de Nike es lo que podríamos llamar **"risk-taking narrativo"**: apuestan por causas polémicas antes de que sean mainstream.

El caso Kaepernick es un manual perfecto:

1. **Riesgo calculado** — perdieron ventas a corto plazo pero ganaron lealtad de audiencia joven
2. **Coherencia interna** — el atleta *ya era* figura antes del anuncio
3. **Silencio estratégico** — dejaron que la cultura hablara por ellos

La credibilidad no se compra con causas; se construye cuando la marca **actúa antes de que sea popular actuar**.`
    },
    graph: null
  },
  {
    delay: 5600,
    msg: {
      role: 'user', sender: GERA,
      content: 'Entonces el riesgo es parte del ADN de Nike. ¿Cómo trasladamos eso a nuestra estrategia de contenido para este proyecto?'
    },
    graph: {
      nodes: [
        { id: 'n7', label: 'ADN de Marca',    createdById: GERA.id, positionX: -180, positionY: -340 },
        { id: 'n8', label: 'Storytelling',     createdById: GERA.id, positionX: 460,  positionY: -80 },
        { id: 'n9', label: 'Contenido Social', createdById: GERA.id, positionX: -420, positionY: 300 },
      ],
      edges: [
        { id: 'e6', source: 'n7', target: 'n8' },
        { id: 'e7', source: 'n7', target: 'n9' },
        { id: 'e8', source: 'n1', target: 'n7' },
      ]
    }
  },
  {
    delay: 7000,
    msg: {
      role: 'assistant', sender: null,
      content: `Para trasladar el ADN de riesgo a su estrategia de contenido, propongo tres pilares:

**1. Voces antes de tiempo**
Identificar atletas o creativos emergentes de la escena mexicana que aún no son mainstream y construir su narrativa *ahora*.

**2. Formato de incomodidad productiva**
Contenido que haga preguntas difíciles sobre rendimiento, cuerpo, o cultura — sin responderlas. Dejar que la audiencia complete el loop.

**3. Rituales de acción**
Piezas que conviertan el "Just Do It" en gestos concretos del día a día: no inspiración genérica, sino micro-retos contextualizados.`
    },
    graph: null
  },
  {
    delay: 8400,
    msg: {
      role: 'user', sender: AGUS,
      content: 'Me gusta lo de rituales. Podríamos explorar cómo se conecta con comunidades locales en CDMX.'
    },
    graph: {
      nodes: [
        { id: 'n10', label: 'Rituales',      createdById: AGUS.id, positionX: 100,  positionY: -420 },
        { id: 'n11', label: 'Comunidad',     createdById: AGUS.id, positionX: -500, positionY: 80 },
        { id: 'n12', label: 'CDMX Cultura',  createdById: AGUS.id, positionX: 520,  positionY: 300 },
      ],
      edges: [
        { id: 'e9',  source: 'n10', target: 'n11' },
        { id: 'e10', source: 'n10', target: 'n12' },
        { id: 'e11', source: 'n9',  target: 'n11' },
      ]
    }
  },
  {
    delay: 9800,
    msg: {
      role: 'assistant', sender: null,
      content: `CDMX como territorio de marca tiene una ventaja enorme: **la cultura de la calle ya practica el Just Do It sin saberlo**.

Desde los skaters de Sullivan hasta los runners del Parque México, hay micro-comunidades que viven el mantra de forma auténtica.

La oportunidad está en **documentar sin producir** — ir al lugar, capturar el ritual ya existente, y conectarlo con el territorio de Nike de manera orgánica.

Esto genera contenido que se siente *encontrado*, no fabricado.`
    },
    graph: null
  },
];

/* ─── edge style helper ─────────────────────────────────────── */
const EDGE_STYLE = { stroke: '#475569' };

function buildMapState(scriptItems) {
  const nodeMap = {};
  const edgeMap = {};
  scriptItems.forEach(item => {
    if (!item.graph) return;
    item.graph.nodes.forEach(n => { nodeMap[n.id] = n; });
    item.graph.edges.forEach(e => { edgeMap[e.id] = e; });
  });
  const nodes = Object.values(nodeMap).map(n => ({
    id: n.id, type: 'topic',
    position: { x: n.positionX, y: n.positionY },
    createdById: n.createdById,
    data: { label: n.label },
  }));
  const edges = Object.values(edgeMap).map(e => ({
    id: e.id, source: e.source, target: e.target, style: EDGE_STYLE,
  }));
  return { nodes, edges };
}

function mergeDegrees(nodes, edges) {
  const deg = {};
  nodes.forEach(n => { deg[n.id] = 0; });
  edges.forEach(e => {
    if (deg[e.source] !== undefined) deg[e.source]++;
    if (deg[e.target] !== undefined) deg[e.target]++;
  });
  return nodes.map(n => ({ ...n, data: { ...n.data, degree: deg[n.id] ?? 0 } }));
}

/* ─── User avatar / label pill ───────────────────────────────── */
const PALETTE_HUBS = ['#7c3aed', '#0369a1', '#047857', '#b45309', '#be123c', '#0e7490', '#3730a3', '#c2410c'];
const PALETTE_LEAVES = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#fb7185', '#22d3ee', '#818cf8', '#fb923c'];

function UserPill({ sender }) {
  const hubColor = PALETTE_HUBS[sender.paletteIdx];
  const leafColor = PALETTE_LEAVES[sender.paletteIdx];
  return (
    <div className="flex items-center gap-1.5 mb-1.5 justify-end">
      <span className="text-[11px] font-semibold" style={{ color: leafColor }}>{sender.name}</span>
      <div className="w-3.5 h-3.5 rounded-full ring-1 ring-white/20" style={{ background: hubColor }} />
    </div>
  );
}

/* ─── Typing indicator ───────────────────────────────────────── */
function MuseTyping() {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1 bg-[#141414] border border-white/10 rounded-2xl rounded-bl-sm px-5 py-3">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  );
}

/* ─── Main demo component ────────────────────────────────────── */
export default function DemoWorkspace() {
  const [visibleMsgs, setVisibleMsgs]   = useState([]);
  const [showTyping,  setShowTyping]    = useState(false);
  const [nodes,       setNodes]         = useState([]);
  const [edges,       setEdges]         = useState([]);
  const [running,     setRunning]       = useState(false);
  const [done,        setDone]          = useState(false);
  const messagesEndRef = useRef(null);
  const timersRef = useRef([]);

  useEffect(() => {
    seedPalettes();
    return () => timersRef.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [visibleMsgs, showTyping]);

  function runDemo() {
    if (running) return;
    setRunning(true);
    setDone(false);
    setVisibleMsgs([]);
    setNodes([]);
    setEdges([]);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    let timeOffset = 0;

    SCRIPT.forEach((item, idx) => {
      // Show typing indicator (only before assistant messages)
      if (item.msg.role === 'assistant') {
        const typingStart = timeOffset + item.delay - 900;
        const t1 = setTimeout(() => setShowTyping(true), Math.max(0, typingStart));
        timersRef.current.push(t1);
      }

      const t2 = setTimeout(() => {
        setShowTyping(false);
        setVisibleMsgs(prev => [...prev, item]);

        // Update graph
        if (item.graph) {
          setNodes(prevN => {
            const existingIds = new Set(prevN.map(n => n.id));
            const newN = item.graph.nodes
              .filter(n => !existingIds.has(n.id))
              .map(n => ({
                id: n.id, type: 'topic',
                position: { x: n.positionX, y: n.positionY },
                createdById: n.createdById,
                data: { label: n.label },
              }));
            const allN = [...prevN, ...newN];
            return allN;
          });
          setEdges(prevE => {
            const existingIds = new Set(prevE.map(e => e.id));
            const newE = item.graph.edges
              .filter(e => !existingIds.has(e.id))
              .map(e => ({ id: e.id, source: e.source, target: e.target, style: EDGE_STYLE }));
            return [...prevE, ...newE];
          });
        }

        if (idx === SCRIPT.length - 1) {
          setRunning(false);
          setDone(true);
        }
      }, timeOffset + item.delay);

      timersRef.current.push(t2);
    });
  }

  function resetDemo() {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setRunning(false);
    setDone(false);
    setShowTyping(false);
    setVisibleMsgs([]);
    setNodes([]);
    setEdges([]);
  }

  // Keep nodes degrees updated
  const nodesWithDeg = mergeDegrees(nodes, edges);

  return (
    <div className="h-screen flex flex-col bg-[#050505]">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center px-6 shrink-0 bg-black/20 backdrop-blur-md z-10">
        <Link to="/" className="ml-12 text-gray-400 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium">
          <ArrowLeft size={16} /> Dashboard
        </Link>

        <div className="mx-auto flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <h1 className="font-semibold text-gray-200">Nike × Muse — Demo</h1>
          {/* User legend */}
          <div className="flex items-center gap-3 ml-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTE_HUBS[GERA.paletteIdx] }} />
              <span className="text-[11px] text-gray-400 font-medium">Gera</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/10">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: PALETTE_HUBS[AGUS.paletteIdx] }} />
              <span className="text-[11px] text-gray-400 font-medium">Agus</span>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {!running && !done && (
            <button
              onClick={runDemo}
              className="px-4 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all"
            >
              ▶ Iniciar demo
            </button>
          )}
          {running && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Loader2 size={14} className="animate-spin" /> Reproduciendo…
            </div>
          )}
          {done && (
            <button
              onClick={resetDemo}
              className="px-4 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 text-sm font-medium border border-white/10 transition-all"
            >
              ↺ Repetir
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Chat panel */}
        <div className="w-1/2 shrink-0 border-r border-white/5 flex flex-col bg-[#0a0a0a]">
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {visibleMsgs.length === 0 && !running && (
              <div className="text-center text-gray-600 mt-16 text-sm space-y-2">
                <div className="text-3xl">🎭</div>
                <p className="text-gray-400 font-medium">Sesión colaborativa — Nike</p>
                <p className="text-gray-600 text-xs">Presiona <strong className="text-gray-500">Iniciar demo</strong> para ver la conversación.</p>
              </div>
            )}

            {visibleMsgs.map((item, i) => {
              const m = item.msg;
              const isUser = m.role === 'user';
              return (
                <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  {/* Sender label for users */}
                  {isUser && m.sender && <UserPill sender={m.sender} />}
                  {!isUser && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-white">M</span>
                      </div>
                      <span className="text-[11px] text-gray-500 font-medium">Muse</span>
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-2xl px-6 py-4 text-[15px] leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-white text-black rounded-br-sm'
                      : 'bg-[#141414] border border-white/10 text-gray-200 rounded-bl-sm'
                  }`}>
                    {isUser
                      ? <div className="whitespace-pre-wrap">{m.content}</div>
                      : <div className="[&>p]:mb-3 [&>ul]:list-disc [&>ul]:ml-6 [&>ul]:mb-3 [&>strong]:text-purple-300 [&>h1]:font-bold [&>h2]:font-semibold [&>ol]:ml-6 [&>ol]:mb-3">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                    }
                  </div>
                </div>
              );
            })}

            {showTyping && <MuseTyping />}
            <div ref={messagesEndRef} />
          </div>

          {/* Fake input (disabled during demo) */}
          <div className="p-4 border-t border-white/5">
            <div className="relative opacity-40 pointer-events-none">
              <div className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-4 pr-12 py-3 text-sm text-gray-600 h-12 flex items-center">
                Modo demo — solo lectura
              </div>
            </div>
          </div>
        </div>

        {/* Network Map */}
        <div className="flex-1 relative overflow-hidden">
          <NetworkMap
            nodes={nodesWithDeg}
            edges={edges}
            onNodeRightClick={() => {}}
            currentUserId={null}
            colorVersion={nodes.length}
          />
          {/* Legend overlay */}
          <div className="absolute bottom-12 left-4 flex flex-col gap-1.5 pointer-events-none">
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-white/5">
              <div className="w-3 h-3 rounded-full" style={{ background: PALETTE_HUBS[GERA.paletteIdx] }} />
              <span className="text-[11px] text-gray-400">Nodos de Gera</span>
            </div>
            <div className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-white/5">
              <div className="w-3 h-3 rounded-full" style={{ background: PALETTE_HUBS[AGUS.paletteIdx] }} />
              <span className="text-[11px] text-gray-400">Nodos de Agus</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
