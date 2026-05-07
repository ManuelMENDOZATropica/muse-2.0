require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { OAuth2Client } = require('google-auth-library');
const { GoogleGenAI } = require('@google/genai');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Real-time sockets
io.on('connection', (socket) => {
  socket.on('join_project', (data) => {
    // data can be a string (projectId) or { projectId, userId, userName, userAvatar }
    const projectId = typeof data === 'string' ? data : data.projectId;
    socket.join(projectId);
    socket._projectId = projectId;
    if (data.userId) {
      socket._userId = data.userId;
      // Broadcast presence to others in room
      socket.to(projectId).emit('user_presence', {
        type: 'join',
        userId: data.userId,
        userName: data.userName,
        userAvatar: data.userAvatar,
      });
      // Send current room members to the joining user
      const roomSockets = io.sockets.adapter.rooms.get(projectId);
      const members = [];
      if (roomSockets) {
        roomSockets.forEach(sid => {
          const s = io.sockets.sockets.get(sid);
          if (s && s._userId && s._userId !== data.userId) {
            members.push({ userId: s._userId, userName: s._userName, userAvatar: s._userAvatar });
          }
        });
      }
      socket._userName = data.userName;
      socket._userAvatar = data.userAvatar;
      socket.emit('presence_list', members);
    }
  });

  socket.on('disconnect', () => {
    if (socket._projectId && socket._userId) {
      socket.to(socket._projectId).emit('user_presence', {
        type: 'leave',
        userId: socket._userId,
      });
    }
  });

  socket.on('node_moved', async (data) => {
    // data: { projectId, nodeId, positionX, positionY, isPinned }
    socket.to(data.projectId).emit('node_moved', data);
    
    if (data.nodeId && data.positionX !== undefined) {
      prisma.node.update({
        where: { id: data.nodeId },
        data: { positionX: data.positionX, positionY: data.positionY }
      }).catch(err => console.error('Error updating node pos:', err));
    }
  });

  socket.on('send_chat', async (data) => {
    const { projectId, content, userId, mode = 'exploracion' } = data;
    try {
      const userMsg = await prisma.message.create({
        data: { projectId, role: 'user', content, createdById: userId || null }
      });
      socket.emit('chat_chunk', { messageId: userMsg.id, role: 'user', content, isDone: true });

      const history = await prisma.message.findMany({
        where: { projectId, OR: [{ createdById: userId }, { createdById: null }] }, orderBy: { createdAt: 'asc' }, take: 10
      });
      const formattedHistory = history.map(m => `${m.role === 'user' ? 'User' : 'Muse'}: ${m.content}`).join('\n');
      
      const coreRule = `REGLA DE ORO SUPREMA: Eres un Socio de Pensamiento (Thought Partner). NO propones ideas, NO inventas metáforas visuales, NO das ejemplos creativos ni haces el trabajo por el usuario. Tu ÚNICA función es ser un "frontón": escuchar lo que el usuario dice y responderle con preguntas socráticas, objeciones o cuestionamientos sobre SU idea para obligarlo a pensar más profundo.\n\n`;

      let systemPrompt = '';
      switch(mode) {
        case 'confrontacion':
          systemPrompt = coreRule + `Actúa en tu Fase de Confrontación (Abogado del Diablo) ⚔️. Tu objetivo es poner a prueba la fragilidad de las ideas del usuario. Sé crítico, punzante pero constructivo. Pregunta por qué importaría la idea, ataca los sesgos, busca el cliché y fuerza al usuario a argumentar y mejorar su idea. Prohibido ser complaciente.`;
          break;
        case 'polinizacion':
          systemPrompt = coreRule + `Actúa en tu Fase de Polinización Cruzada (Síntesis) 🧬. Tu objetivo es proponer que el usuario combine elementos dispares. Sugiere fusiones improbables ("¿qué pasaría si unimos X con Y?") para que el usuario sea quien imagine y detalle las soluciones híbridas.`;
          break;
        case 'escalabilidad':
          systemPrompt = coreRule + `Actúa en tu Fase de Escalabilidad (Mutación) 🌐. Tu objetivo es desafiar al usuario a expandir su idea transversalmente (activaciones, PR, plataformas). Pregúntale cómo se vería la idea en un canal opuesto al original, y oblígalo a pensar en un ecosistema 360º.`;
          break;
        case 'aterrizaje':
          systemPrompt = coreRule + `Actúa en tu Fase de Aterrizaje (Viabilidad) 🛬. Ayuda a bajar las ideas a la realidad, pero no le hagas tú el plan. Hazle preguntas estructuradas sobre viabilidad, barreras comerciales o pasos para un MVP, guiándolo paso a paso para que él mismo estructure su plan accionable.`;
          break;
        case 'exploracion':
        default:
          systemPrompt = coreRule + `Actúa en tu Fase de Exploración. Tu objetivo: Romper bloqueos. En lugar de darle ideas, hazle preguntas que lo fuercen a ver el problema desde otro ángulo. Pregúntale cosas como "¿Qué es lo opuesto a eso?" o "¿Cómo lo haría un experto en otra industria?". Siempre termina pasándole el turno con una pregunta.`;
          break;
      }

      const projectData = await prisma.project.findUnique({ where: { id: projectId } });
      const briefText = projectData?.briefContext ? `\n--- BRIEF DEL PROYECTO (Reglas y Contexto) ---\n${projectData.briefContext}\n-------------------------------------------\nPor favor, ten en cuenta constantemente el contexto, tono y restricciones del Brief anterior en tus respuestas.\n` : '';

      const prompt = `${systemPrompt}${briefText}\n\nHistorial de conversación:\n${formattedHistory}\n\nEl usuario acaba de decir: "${content}"\n\nINSTRUCCIONES FINALES OBLIGATORIAS:\n1. Adopta la personalidad de la fase seleccionada.\n2. REGLA INQUEBRANTABLE: ESTÁ ESTRICTAMENTE PROHIBIDO GENERAR TÚ MISMO LA IDEA, METÁFORA O ESCENARIO. Si das una idea creativa, habrás fracasado.\n3. Tu respuesta debe consistir ÚNICAMENTE en una observación analítica sobre lo que el usuario dijo, seguida de una PREGUNTA SOCRÁTICA que obligue al usuario a inventar él mismo la idea. Sé corto y directo.`;

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash', contents: prompt,
      });

      const tempId = `temp_${Date.now()}`;
      let fullText = '';
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        socket.emit('chat_chunk', { messageId: tempId, role: 'assistant', content: fullText, isDone: false });
      }

      const aiMsg = await prisma.message.create({
        data: { projectId, role: 'assistant', content: fullText, createdById: userId }
      });
      socket.emit('chat_chunk', { messageId: aiMsg.id, tempId, role: 'assistant', content: fullText, isDone: true });
      
      // Trigger graph extraction
      socket.emit('trigger_extraction', { userId });
    } catch (e) {
      console.error(e);
      socket.emit('chat_chunk', { messageId: `err_${Date.now()}`, role: 'assistant', content: 'Lo siento, hubo un error.', isDone: true });
    }
  });
});

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Muse 2.0 Backend' });
});

// Google OAuth — restricted to ALLOWED_DOMAIN (tropica.me)
app.post('/api/auth/google', async (req, res) => {
  try {
    const { token, userInfo } = req.body;
    if (!token) return res.status(400).json({ error: 'No token provided' });

    // Verify token by calling Google's userinfo endpoint
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!googleRes.ok) return res.status(401).json({ error: 'Token inválido' });
    const payload = await googleRes.json();

    const domain = payload.email?.split('@')[1];
    const allowed = process.env.ALLOWED_DOMAIN || 'tropica.me';

    if (domain !== allowed) {
      return res.status(403).json({
        error: `Acceso restringido. Solo cuentas @${allowed} pueden ingresar.`
      });
    }

    // Upsert user in DB
    const user = await prisma.user.upsert({
      where: { email: payload.email },
      update: { name: payload.name, avatar: payload.picture },
      create: { email: payload.email, name: payload.name, avatar: payload.picture },
    });

    console.log(`✓ Login: ${user.email}`);
    res.json(user);
  } catch (error) {
    console.error('Auth Error:', error.message);
    res.status(401).json({ error: 'Error de autenticación' });
  }
});


// Get user's projects (and all public projects)
app.get('/api/users/:userId/projects', async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: req.params.userId },
          { isPublic: true }
        ]
      },
      include: {
        owner: { select: { id: true, name: true, avatar: true } },
        nodes: {
          include: { createdBy: { select: { id: true, name: true, avatar: true } } },
          take: 1, // just for contributors, don't need all
        },
        _count: { select: { nodes: true, messages: true } }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// Helper for parsing text/pdf
async function parseFile(file) {
  if (!file) return null;
  if (file.mimetype === 'application/pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  return file.buffer.toString('utf8');
}

// Pre-processes a research text to extract the bibliography as a map: { "3": "https://..." }
function extractCitations(text) {
  const citations = {};
  // Find the bibliography section (common headers in Spanish/English)
  const biblioMatch = text.match(/(?:Fuentes\s+citadas|Bibliograf[ií]a|Referencias|Sources|References)[:\s\n]+([\s\S]+)/i);
  const biblioSection = biblioMatch ? biblioMatch[1] : text; // fallback to full text

  // Match numbered entries like: "3. Title text, https://..."
  // or "3. Title - https://..."
  const lineRegex = /^(\d{1,3})\.\s+.{0,200}(https?:\/\/[^\s,;"'<>\)]+)/gm;
  let match;
  while ((match = lineRegex.exec(biblioSection)) !== null) {
    const num = match[1];
    const url = match[2].replace(/[.,;)"']+$/, ''); // strip trailing punctuation
    citations[num] = url;
  }
  console.log(`[Citations] Extracted ${Object.keys(citations).length} citations from research document.`, citations);
  return citations;
}

// Create project
app.post('/api/projects', upload.fields([{ name: 'brief', maxCount: 1 }, { name: 'research', maxCount: 1 }]), async (req, res) => {
  try {
    console.log('Project creation attempt. req.body:', req.body);
    console.log('req.files exists:', !!req.files);
    const { title, ownerId } = req.body;
    
    if (!title || !ownerId) {
       console.error("Missing title or ownerId");
       return res.status(400).json({ error: "Missing title or ownerId" });
    }

    let briefContext = null;
    let researchContext = null;

    if (req.files) {
      if (req.files.brief) briefContext = await parseFile(req.files.brief[0]);
      if (req.files.research) researchContext = await parseFile(req.files.research[0]);
    }

    const project = await prisma.project.create({
      data: { title, ownerId, briefContext }
    });

    if (briefContext) {
      const summaryPrompt = `Haz un resumen súper corto (2-3 oraciones) y con tono amigable del siguiente brief, presentándote como Muse y dándole la bienvenida al equipo al proyecto:\n\n${briefContext.substring(0, 5000)}`;
      try {
        const summaryRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: summaryPrompt });
        await prisma.message.create({
          data: { projectId: project.id, role: 'assistant', content: summaryRes.text }
        });
      } catch (e) {
        console.error('Failed to generate brief summary message', e);
      }
    }

    // If research exists, extract initial nodes via Gemini
    if (researchContext) {
      // STEP 1: Pre-extract citations from the document (deterministic, no AI)
      const citations = extractCitations(researchContext);
      const citationCount = Object.keys(citations).length;
      const citationsBlock = citationCount > 0
        ? `\nDICCIONARIO DE CITAS (URLs reales extraídas del documento — ÚSA ESTAS Y SOLO ESTAS):\n${JSON.stringify(citations, null, 2)}\n`
        : '';

      // STEP 2: Build prompt with citation map injected
      const prompt = `Eres un arquitecto de información. Extrae todos los nodos que consideres necesarios (pueden ser 15, 20 o más) para tener un volcado visual completo del siguiente texto de investigación profunda.

 IMPORTANTE: 
 1. TODOS los nombres de los nodos deben estar ESTRICTAMENTE EN ESPAÑOL.
 2. En lugar de un solo hub, crea 3 o 4 "hubs" temáticos (ej. "Data Points", "Ejemplos", "Contexto Cultural"). Conecta los nodos pequeños a su hub correspondiente para que formen "mini universos" separados.
 3. ENLACES (CRÍTICO): El texto menciona fuentes con números de cita (ej. "...mercado creció.6"). Tienes a tu disposición el DICCIONARIO DE CITAS de abajo, que mapea cada número a su URL real. Cuando crees un nodo para un concepto que tiene un número de cita cerca, busca ese número en el diccionario y pon su URL en el campo "url" del nodo. SOLO usa URLs del diccionario. Si el número no está en el diccionario, omite el campo "url".
 4. Añade un campo "description" con una explicación (1-2 oraciones) del contenido.${citationsBlock}

 Texto de Investigación:
 ${researchContext.substring(0, 12000)}
 
 Nombres cortos (1-5 palabras). IDs únicos tipo "n1", "n2".
 
 Devuelve ÚNICAMENTE JSON válido con esta estructura:
 {
   "nodes": [
     {"id":"n1","label":"Treatonomics", "description": "Tendencia de pequeños lujos...", "url": "https://kantar.com/..."},
     {"id":"n2","label":"Data Points"}
   ],
   "edges": [
     {"source":"n1","target":"n2"}
   ]
 }`;
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: { responseMimeType: 'application/json' }
        });
        const parseTarget = response.text;
        const parsed = JSON.parse(parseTarget);
        
        const idMapping = {};
        if (parsed.nodes && Array.isArray(parsed.nodes)) {
          for (let i = 0; i < parsed.nodes.length; i++) {
            const n = parsed.nodes[i];
            const angle = (i / Math.max(parsed.nodes.length, 1)) * Math.PI * 2 + Math.random() * 0.5;
            const radius = i === 0 ? 0 : 200 + Math.random() * 250;
            const newNode = await prisma.node.create({
              data: {
                projectId: project.id,
                label: n.label,
                data: { author: 'MAGNUM', isMagnum: true, url: n.url, description: n.description },
                positionX: Math.cos(angle) * radius,
                positionY: Math.sin(angle) * radius,
                type: i === 0 ? 'topic' : 'topic',
                createdById: null,
              }
            });
            idMapping[n.id] = newNode.id;
          }
        }
        if (parsed.edges && Array.isArray(parsed.edges)) {
          for (const e of parsed.edges) {
            const srcId = idMapping[e.source];
            const tgtId = idMapping[e.target];
            if (srcId && tgtId && srcId !== tgtId) {
              await prisma.edge.create({
                data: { projectId: project.id, sourceId: srcId, targetId: tgtId }
              });
            }
          }
        }
      } catch(e) {
        console.error('Failed to parse initial research graph', e);
      }
    }

    res.json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Error creating project' });
  }
});

// Rename project
app.patch('/api/projects/:id', async (req, res) => {
  try {
    const { title } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { title }
    });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Error renaming project' });
  }
});

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting project' });
  }
});

// Node summary — AI-generated concept summary + conversation bullet points
app.get('/api/nodes/:nodeId/summary', async (req, res) => {
  try {
    const { nodeId } = req.params;
    const node = await prisma.node.findUnique({ where: { id: nodeId } });
    if (!node) return res.status(404).json({ error: 'Node not found' });

    // If summary was pre-generated at creation time, return it immediately
    if (node.data?.aiSummary && node.data?.bullets?.length) {
      return res.json({ label: node.label, aiSummary: node.data.aiSummary, bullets: node.data.bullets });
    }

    // Fallback: generate on demand using stored triggerContext (or recent messages)
    const chatContext = node.data?.triggerContext || (
      await prisma.message.findMany({
        where: { projectId: node.projectId, createdAt: { lte: node.createdAt } },
        orderBy: { createdAt: 'desc' },
        take: 2,
      })
    ).reverse().map(m => `${m.role === 'user' ? 'Usuario' : 'Muse'}: ${m.content}`).join('\n');

    const summaryPrompt = `Eres un asistente de síntesis. El concepto "${node.label}" surgió en esta conversación:
${chatContext || '(Sin contexto disponible)'}
IMPORTANTE: El concepto es únicamente lo que se discutió en el Último intercambio. NO mezcles temas de turnos anteriores no relacionados.
Genera DOS secciones en español como JSON:
{"concept": "1 párrafo (2-3 oraciones) sobre qué es '${node.label}' en este contexto", "bullets": ["punto clave 1", "punto clave 2", "punto clave 3"]}`;

    let aiSummary = '';
    let bullets = [];
    try {
      const summaryRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: summaryPrompt,
        config: { responseMimeType: 'application/json' }
      });
      const parsed = JSON.parse(summaryRes.text);
      aiSummary = parsed.concept || '';
      bullets = parsed.bullets || [];
    } catch (e) {
      console.error('Summary generation failed:', e);
    }

    res.json({ label: node.label, aiSummary, bullets });
  } catch (error) {
    console.error('Node summary error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});




// Get single project details (including nodes, edges, messages)
app.get('/api/projects/:id', async (req, res) => {
  try {
    const userId = req.query.userId;
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        nodes: true,
        edges: true,
        messages: { 
          where: userId ? { OR: [{ createdById: userId }, { createdById: null }] } : undefined,
          orderBy: { createdAt: 'asc' } 
        }
      }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching project' });
  }
});

// (Chat is now handled via Socket.IO above)


// Extract Graph in Background
app.post('/api/projects/:id/extract-graph', async (req, res) => {
  const projectId = req.params.id;
  const { userId } = req.body;

  try {
    // Last 4 messages for context
    const history = await prisma.message.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 4
    });
    const formattedHistory = history.reverse()
      .map(m => `${m.role === 'user' ? 'User' : 'Muse'}: ${m.content}`).join('\n');

    // Existing concepts on the map (to avoid duplicates)
    const existingNodes = await prisma.node.findMany({ where: { projectId } });
    const existingLabels = existingNodes.map(n => n.label.toLowerCase());
    const existingList = existingLabels.length
      ? `Conceptos YA en el mapa (NO los repitas ni agregues similares): ${existingLabels.join(', ')}`
      : 'El mapa está vacío.';

    const existingLabelsFormatted = existingNodes.map(n => `"${n.label}"`).join(', ');

    const prompt = `Eres un arquitecto de información que construye un mapa conceptual colaborativo.

Conversación reciente:
${formattedHistory}

${existingList}

Tu tarea tiene 2 pasos:

PASO 1 — CONCEPTOS NUEVOS (Nodos):
Extrae todos los conceptos clave, analogías, ideas o ejemplos que hayan surgido en el ÚLTIMO intercambio de la conversación. 
Crea los nodos necesarios (pueden ser 4, 6, 8 o más) para mapear toda la riqueza de lo discutido. NO te limites a solo 1 o 2.
Si un concepto YA está en el mapa, NO lo vuelvas a crear como nodo.

PASO 2 — CONEXIONES (Edges):
- Conecta los conceptos nuevos entre sí SOLO si hay una relación EXPLÍCITA en la conversación (no inferida).
- IMPORTANTE: Si en la conversación se hablaron de temas distintos de forma SEPARADA, NO los conectes entre sí. Los edges son conexiones reales, no asociaciones creativas.
- SOLO crea edges entre nodos existentes y nuevos si el usuario o Muse los mencionó juntos explicitamente.

Reglas:
- TODOS los nombres de los nodos deben estar en ESPAÑOL.
- Nombres cortos (1-5 palabras).
- Si no hay ideas nuevas reales en la charla, devuelve JSON vacío.

Devuelve ÚNICAMENTE JSON válido:
{
  "nodes": [
    {"id":"n1","label":"Cápsula Cromática"},
    {"id":"n2","label":"Tutoriales NYX"}
  ],
  "edges": [
    {"source":"n1","target":"n2"}
  ]
}
Si no hay nada nuevo: {"nodes":[],"edges":[]}`;




    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: 'application/json' }
    });

    let extractedNodes = [];
    let extractedEdges = [];
    try {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed.nodes)) extractedNodes = parsed.nodes;
      if (Array.isArray(parsed.edges)) extractedEdges = parsed.edges;
    } catch (e) { console.error('JSON parse error', e); }

    // Hard cap: max 10 new nodes per extraction to avoid absolute chaos
    extractedNodes = extractedNodes.slice(0, 10);

    // Filter out any node whose label is too similar to an existing one
    const normalize = s => s.toLowerCase().replace(/[^a-záéíóúñ]/g, '');
    const existingNorm = existingLabels.map(normalize);
    extractedNodes = extractedNodes.filter(n =>
      !existingNorm.includes(normalize(n.label))
    );

    const createdNodes = [];
    const createdEdges = [];
    const idMapping = {};

    // Build a label→dbId map for existing nodes (for cross-edges)
    const existingLabelToId = Object.fromEntries(
      existingNodes.map(n => [n.label.toLowerCase(), n.id])
    );

    // Helper: generate and store summary for a node in the background
    const triggerContext = history.map(m => `${m.role === 'user' ? 'Usuario' : 'Muse'}: ${m.content}`).join('\n');

    for (let i = 0; i < extractedNodes.length; i++) {
      const n = extractedNodes[i];
      // Spread new nodes outward with larger radius and consistent angular spacing + jitter
      const baseAngle = (i / Math.max(extractedNodes.length, 1)) * Math.PI * 2;
      const jitter = (Math.random() - 0.5) * 0.8;
      const angle = baseAngle + jitter;
      const radius = 500 + Math.random() * 300;
      const newNode = await prisma.node.create({
        data: {
          projectId,
          label: n.label,
          data: { triggerContext }, // store trigger context for instant summary on click
          positionX: Math.cos(angle) * radius,
          positionY: Math.sin(angle) * radius,
          type: 'topic',
          createdById: userId || null,
        }
      });
      idMapping[n.id] = newNode.id;
      createdNodes.push(newNode);

      // Pre-generate summary in background (fire-and-forget)
      (async () => {
        try {
          const sp = `Eres un asistente de síntesis. El concepto "${n.label}" surgió en esta conversación:
${triggerContext}
IMPORTANTE: El concepto es únicamente lo que se discutías en el Último intercambio. NO mezcles temas de turnos anteriores no relacionados.
Genera DOS secciones en español como JSON:
{"concept": "1 párrafo (2-3 oraciones) sobre qué es '${n.label}' en este contexto", "bullets": ["punto clave 1", "punto clave 2", "punto clave 3"]}`;
          const sr = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: sp, config: { responseMimeType: 'application/json' } });
          const parsed = JSON.parse(sr.text);
          await prisma.node.update({
            where: { id: newNode.id },
            data: { data: { triggerContext, aiSummary: parsed.concept || '', bullets: parsed.bullets || [] } }
          });
        } catch(e) { /* silent fail, will generate on demand */ }
      })();
    }

    for (const e of extractedEdges) {
      const srcId = idMapping[e.source] || existingLabelToId[e.source?.toLowerCase()];
      const tgtId = idMapping[e.target] || existingLabelToId[e.target?.toLowerCase()];
      if (srcId && tgtId && srcId !== tgtId) {
        try {
          const newEdge = await prisma.edge.create({
            data: { projectId, sourceId: srcId, targetId: tgtId }
          });
          createdEdges.push(newEdge);
        } catch (_) { /* duplicate edge — skip */ }
      }
    }

    // Emit to room
    io.to(projectId).emit('project_updated', {
      newMessages: [],
      newNodes: createdNodes,
      newEdges: createdEdges
    });

    res.json({ newNodes: createdNodes, newEdges: createdEdges });

  } catch (error) {
    console.error('Extract Graph Error:', error);
    res.status(500).json({ error: 'Extraction failed' });
  }
});

// Connect Nodes (Context Menu Action)
app.post('/api/projects/:id/connect-nodes', async (req, res) => {
  const projectId = req.params.id;
  const { nodeA, nodeB } = req.body; // { id, label }
  
  try {
    const existingNodes = await prisma.node.findMany({ where: { projectId } });
    const existingLabels = existingNodes.map(n => n.label.toLowerCase()).join(', ');

    const prompt = `Actúa como Muse. El usuario quiere conectar los conceptos "${nodeA.label}" y "${nodeB.label}".
Conceptos YA en el mapa: ${existingLabels}

Genera EXACTAMENTE 1 concepto nuevo que funcione como puente intermedio, conexión lógica o punto de encuentro entre ambos.
Usa un nombre corto (1-3 palabras). ID único tipo "c1".
Debe tener un edge hacia "${nodeA.id}" y un edge hacia "${nodeB.id}".

JSON válido:
{
  "nodes": [{"id":"c1","label":"Concepto Puente"}],
  "edges": [
    {"source":"${nodeA.id}","target":"c1"},
    {"source":"c1","target":"${nodeB.id}"}
  ]
}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    const rawAiResponse = response.text;
    let extractedNodes = [];
    let extractedEdges = [];
    
    const jsonMatch = rawAiResponse.match(/```json([\s\S]*?)```/);
    const parseTarget = jsonMatch ? jsonMatch[1] : rawAiResponse;
    try {
      const parsed = JSON.parse(parseTarget.replace(/```/g, ''));
      if (parsed && Array.isArray(parsed.nodes)) extractedNodes = parsed.nodes;
      if (parsed && Array.isArray(parsed.edges)) extractedEdges = parsed.edges;
    } catch (e) { console.error('JSON parse error (Connect Nodes)', e); }

    const createdNodes = [];
    const createdEdges = [];
    const idMapping = {};

    for (let i = 0; i < extractedNodes.length; i++) {
      const n = extractedNodes[i];
      const midX = ((nodeA.x || 0) + (nodeB.x || 0)) / 2;
      const midY = ((nodeA.y || 0) + (nodeB.y || 0)) / 2;
      const newNode = await prisma.node.create({
        data: {
          projectId,
          label: n.label,
          data: {},
          positionX: midX,
          positionY: midY,
          type: 'topic'
        }
      });
      createdNodes.push(newNode);

      // Force create the two edges connecting A -> New -> B
      try {
        const edge1 = await prisma.edge.create({ data: { projectId, sourceId: nodeA.id, targetId: newNode.id } });
        createdEdges.push(edge1);
        const edge2 = await prisma.edge.create({ data: { projectId, sourceId: newNode.id, targetId: nodeB.id } });
        createdEdges.push(edge2);
      } catch (e) { console.error('Error creating forced edges', e); }
      
      // We only strictly need 1 intermediate node, so break if it generated more
      break;
    }

    io.to(projectId).emit('project_updated', {
      newMessages: [],
      newNodes: createdNodes,
      newEdges: createdEdges
    });

    res.json({ newNodes: createdNodes, newEdges: createdEdges });
  } catch (error) {
    console.error('Connect Nodes Error:', error);
    res.status(500).json({ error: 'Connection failed' });
  }
});

// Expand Node (Context Menu Actions)
app.post('/api/projects/:id/expand-node', async (req, res) => {
  const projectId = req.params.id;
  const { nodeId, nodeLabel, relationType } = req.body;

  try {
    const existingNodes = await prisma.node.findMany({ where: { projectId } });
    const existingLabels = existingNodes.map(n => n.label.toLowerCase()).join(', ');

    let promptType = '';
    let count = 3;
    if (relationType === 'related') {
      promptType = 'conceptos semejantes que funcionen como caminos similares';
      count = 3;
    } else {
      promptType = 'conceptos opuestos o disruptivos';
      count = 5;
    }

    const prompt = `Eres un arquitecto de información expandiendo el nodo "${nodeLabel}" en un mapa conceptual colaborativo.

Conceptos YA en el mapa (NO repetir): ${existingLabels}

Genera EXACTAMENTE ${count} ${promptType} de "${nodeLabel}" que no estén en el mapa.
Nombres muy cortos (1-3 palabras). IDs únicos tipo "e1"…"e5".
Todas las edges parten del nodo "${nodeId}".

JSON válido:
{
  "nodes": [{"id":"e1","label":"Concepto"}],
  "edges": [{"source":"${nodeId}","target":"e1"}]
}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    const rawAiResponse = response.text;
    let extractedNodes = [];
    let extractedEdges = [];
    
    const jsonMatch = rawAiResponse.match(/```json([\s\S]*?)```/);
    const parseTarget = jsonMatch ? jsonMatch[1] : rawAiResponse;
    try {
      const parsed = JSON.parse(parseTarget.replace(/```/g, ''));
      if (parsed && Array.isArray(parsed.nodes)) extractedNodes = parsed.nodes;
      if (parsed && Array.isArray(parsed.edges)) extractedEdges = parsed.edges;
    } catch (e) {
      console.error("Failed to parse JSON from AI", e);
    }
    
    const createdNodes = [];
    const createdEdges = [];
    
    if (extractedNodes.length > 0) {
      // Get the position of the parent node to arrange the new ones around it
      const parentNode = await prisma.node.findUnique({ where: { id: nodeId } });
      const centerX = parentNode ? parentNode.positionX : 0;
      const centerY = parentNode ? parentNode.positionY : 0;
      
      const idMapping = {}; 

      for (let i = 0; i < extractedNodes.length; i++) {
        const n = extractedNodes[i];
        // Distribute in a wider scattered circle around the parent node to prevent overlap
        const angle = (i / extractedNodes.length) * Math.PI * 2 + (Math.random() * 0.5);
        const radius = 350 + (Math.random() * 150);
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;

        const newNode = await prisma.node.create({
          data: {
            projectId,
            label: n.label,
            data: {},
            positionX: centerX + offsetX,
            positionY: centerY + offsetY,
            type: 'topic'
          }
        });
        idMapping[n.id] = newNode.id;
        createdNodes.push(newNode);
      }
      
      for (let i = 0; i < extractedEdges.length; i++) {
        const e = extractedEdges[i];
        // the source is the original node ID (which is already a DB UUID)
        const sourceDbId = e.source === nodeId ? nodeId : idMapping[e.source];
        const targetDbId = idMapping[e.target];
        
        if (sourceDbId && targetDbId) {
          const newEdge = await prisma.edge.create({
            data: {
              projectId,
              sourceId: sourceDbId,
              targetId: targetDbId,
            }
          });
          createdEdges.push(newEdge);
        }
      }
    }

    // 3. Optional: Map Extraction
    let newNodes = [];
    let newEdges = [];
    if (extractGraph) {
      const g = await extractConceptsFromChat(projectId, userMsg, userId);
      newNodes = g.nodes;
      newEdges = g.edges;
    }

    // 4. Emit to all clients in the project room
    io.to(projectId).emit('project_updated', {
      newMessages: [userMsg, assistantMsg].filter(Boolean),
      newNodes,
      newEdges
    });

    res.json({
      message: userMsg,
      assistantMessage: assistantMsg,
      newNodes,
      newEdges
    });
    
  } catch (error) {
    console.error('Expand Node Error:', error);
    res.status(500).json({ error: 'Expansion failed' });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (with Socket.IO)`);
});
