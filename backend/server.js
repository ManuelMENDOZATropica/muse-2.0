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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Real-time sockets
io.on('connection', (socket) => {
  socket.on('join_project', (projectId) => {
    socket.join(projectId);
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
    const { projectId, content, userId } = data;
    try {
      const userMsg = await prisma.message.create({
        data: { projectId, role: 'user', content, createdById: userId || null }
      });
      io.to(projectId).emit('chat_chunk', { messageId: userMsg.id, role: 'user', content, isDone: true });

      const history = await prisma.message.findMany({
        where: { projectId }, orderBy: { createdAt: 'asc' }, take: 10
      });
      const formattedHistory = history.map(m => `${m.role === 'user' ? 'User' : 'Muse'}: ${m.content}`).join('\n');
      const prompt = `Actúa como Muse, un colaborador creativo experto. Estamos conversando sobre un proyecto.\nHistorial de conversación:\n${formattedHistory}\n\nEl usuario acaba de decir: "${content}"\n\nTu tarea es responder al usuario de forma conversacional, amigable, concisa y usando Markdown (listas, negritas, etc) para organizar tus ideas.`;

      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash', contents: prompt,
      });

      const tempId = `temp_${Date.now()}`;
      let fullText = '';
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        io.to(projectId).emit('chat_chunk', { messageId: tempId, role: 'assistant', content: fullText, isDone: false });
      }

      const aiMsg = await prisma.message.create({
        data: { projectId, role: 'assistant', content: fullText }
      });
      io.to(projectId).emit('chat_chunk', { messageId: aiMsg.id, tempId, role: 'assistant', content: fullText, isDone: true });
      
      // Trigger graph extraction
      socket.emit('trigger_extraction', { userId });
    } catch (e) {
      console.error(e);
      io.to(projectId).emit('chat_chunk', { messageId: `err_${Date.now()}`, role: 'assistant', content: 'Lo siento, hubo un error.', isDone: true });
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
          include: { createdBy: { select: { id: true, name: true, avatar: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error fetching projects' });
  }
});

// Create project
app.post('/api/projects', async (req, res) => {
  try {
    const { title, ownerId } = req.body;
    const project = await prisma.project.create({
      data: { title, ownerId }
    });
    res.json(project);
  } catch (error) {
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


// Get single project details (including nodes, edges, messages)
app.get('/api/projects/:id', async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        nodes: true,
        edges: true,
        messages: { orderBy: { createdAt: 'asc' } }
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

Tu tarea tiene 3 pasos:

PASO 1 — CONCEPTO PRINCIPAL (id siempre "main"):
Identifica el concepto que el usuario mencionó EXPLÍCITAMENTE por su nombre (ej: "señales de humo" → label "Señales de Humo"). Este es el hub central.
Si ese concepto YA está en el mapa, omite el nodo "main" pero úsalo como referencia en edges con source = su label exacto.

PASO 2 — HASTA 2 CONCEPTOS DERIVADOS (nuevos):
Agrega máximo 2 conceptos secundarios nuevos que deriven del principal.
Todos sus edges van DESDE "main" HACIA los derivados.

PASO 3 — CONEXIONES SEMÁNTICAS CON NODOS EXISTENTES:
Revisa los conceptos ya en el mapa: ${existingLabelsFormatted}
Si el concepto principal (main) es semánticamente cercano a alguno de ellos, agrega un edge entre ellos. ESPECIALMENTE trata de conectar conceptos creados por diferentes usuarios si tienen sinergia.
Usa el label EXACTO del nodo existente como valor de "source" o "target" en el edge.
Puedes crear hasta 3 de estas conexiones cruzadas. No son obligatorias — solo si hay cercanía real.

Reglas:
- Nombres MUY cortos (1-3 palabras). No repitas conceptos existentes.
- Si no hay nada genuinamente nuevo, devuelve vacío.

Devuelve ÚNICAMENTE JSON válido:
{
  "nodes": [
    {"id":"main","label":"Señales de Humo"},
    {"id":"d1","label":"Comunicación Ancestral"}
  ],
  "edges": [
    {"source":"main","target":"d1"},
    {"source":"main","target":"Telefonía"}
  ]
}
Si no hay nada nuevo: {"nodes":[],"edges":[]}`;


    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    let extractedNodes = [];
    let extractedEdges = [];
    const jsonMatch = response.text.match(/```json([\s\S]*?)```/);
    const parseTarget = jsonMatch ? jsonMatch[1] : response.text;
    try {
      const parsed = JSON.parse(parseTarget.replace(/```/g, ''));
      if (Array.isArray(parsed.nodes)) extractedNodes = parsed.nodes;
      if (Array.isArray(parsed.edges)) extractedEdges = parsed.edges;
    } catch (e) { console.error('JSON parse error', e); }

    // Hard cap: max 3 new nodes per extraction
    extractedNodes = extractedNodes.slice(0, 3);

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

    for (let i = 0; i < extractedNodes.length; i++) {
      const n = extractedNodes[i];
      const angle = (i / Math.max(extractedNodes.length, 1)) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 300 + Math.random() * 150;
      const newNode = await prisma.node.create({
        data: {
          projectId,
          label: n.label,
          data: {},
          positionX: Math.cos(angle) * radius,
          positionY: Math.sin(angle) * radius,
          type: 'topic',
          createdById: userId || null,
        }
      });
      idMapping[n.id] = newNode.id;
      createdNodes.push(newNode);
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
