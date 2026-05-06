import { useEffect, useRef, useState } from 'react';
// p5 is dynamically imported inside useEffect to prevent
// its Friendly Error System from polluting window globals at page load
import { getUserPalette } from './UserColorPicker';

function hexRgb(hex) {
  if (!hex || hex.length < 7) return [120, 120, 120];
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

export default function NetworkMap({ nodes, edges, onNodeClick, onNodeRightClick, onNodeMove, currentUserId, colorVersion }) {
  const containerRef = useRef(null);
  const graphRef     = useRef({ nodes: [], edges: [], dirty: false });
  const cbRightRef   = useRef(onNodeRightClick);
  const cbClickRef   = useRef(onNodeClick);
  const cbMoveRef    = useRef(onNodeMove);

  useEffect(() => { cbRightRef.current = onNodeRightClick; }, [onNodeRightClick]);
  useEffect(() => { cbClickRef.current = onNodeClick; }, [onNodeClick]);
  useEffect(() => { cbMoveRef.current = onNodeMove; }, [onNodeMove]);
  useEffect(() => {
    graphRef.current = { nodes, edges, dirty: true };
  }, [nodes, edges]);
  // When user changes color, trigger re-sync so node palettes update
  useEffect(() => {
    graphRef.current = { ...graphRef.current, dirty: true };
  }, [colorVersion]);

  useEffect(() => {
    if (!containerRef.current) return;
    let inst = null;
    let cancelled = false;

    import('p5').then(mod => {
      if (cancelled) return;
      const p5 = mod.default;

      const sketch = (p) => {
        // Camera state
        let cam       = { x: 0, y: 0, z: 1 };
        let targetCam = { x: 0, y: 0, z: 1 };   // for smooth zoom
        let sNodes    = [];
        let sEdges    = [];
        let dragging  = null;
        let panning   = false;
        let panStart  = { x:0, y:0, cx:0, cy:0 };

        /* ── degree map ──────────────────────────── */
        function degrees(ns, es) {
          const d = {};
          ns.forEach(n => { d[n.id] = 0; });
          es.forEach(e => {
            if (d[e.source] !== undefined) d[e.source]++;
            if (d[e.target] !== undefined) d[e.target]++;
          });
          return d;
        }

        /* ── sync graph → simulation ─────────────── */
        function syncGraph() {
          const { nodes: ns, edges: es } = graphRef.current;
          const deg  = degrees(ns, es);
          const byId = Object.fromEntries(sNodes.map(n => [n.id, n]));

          sNodes = ns.map(n => {
            const label   = n.data?.label ?? n.label ?? '';
            const d       = deg[n.id] ?? 0;
            const radius  = d >= 2 ? Math.min(22 + d * 9, 72) : 12;
            const uid     = n.createdById ?? n.data?.createdById ?? null;
            // Use centralized palette (reads from localStorage if user changed color)
            let palette = getUserPalette(uid);
            if (n.data?.isMagnum) {
              palette = { name: 'MAGNUM', hub: '#4b5563', leaf: '#9ca3af' };
            }
            const prev    = byId[n.id];
            if (prev) return { ...prev, label, degree: d, radius, palette, data: n.data };
            const angle = Math.random() * Math.PI * 2;
            const dist  = 80 + Math.random() * 200;
            const startX = n.position?.x ?? (Math.cos(angle) * dist);
            const startY = n.position?.y ?? (Math.sin(angle) * dist);
            return {
              id: n.id, label, degree: d, radius, palette, data: n.data,
              x: startX,
              y: startY,
              vx: (Math.random()-.5)*2,
              vy: (Math.random()-.5)*2,
            };
          });

          sEdges = es.map(e => ({
            src: e.source, tgt: e.target,
            color: e.style?.stroke ?? '#334155',
          }));

          if (dragging) {
            dragging = sNodes.find(n => n.id === dragging.id) || null;
          }
        }

        /* ── setup ───────────────────────────────── */
        p.setup = () => {
          const w = containerRef.current.offsetWidth;
          const h = containerRef.current.offsetHeight;
          const cv = p.createCanvas(w, h);
          cv.elt.style.display = 'block';
          cv.elt.addEventListener('contextmenu', e => {
            e.preventDefault();
            const rect = cv.elt.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const worldX = (mouseX - cam.x) / cam.z;
            const worldY = (mouseY - cam.y) / cam.z;
            
            const n = sNodes.find(node => {
              const r = Math.max(node.radius, 14);
              return (node.x - worldX)**2 + (node.y - worldY)**2 < r*r;
            });
            
            if (n && cbRightRef.current) {
              cbRightRef.current(n, e.clientX, e.clientY);
            }
          });
          p.textFont('Inter, system-ui, sans-serif');
          syncGraph();
          cam = { x: w/2, y: h/2, z: 1 };
          targetCam = { ...cam };
        };

        p.windowResized = () => {
          if (!containerRef.current) return;
          p.resizeCanvas(containerRef.current.offsetWidth, containerRef.current.offsetHeight);
        };

        /* ── main loop ───────────────────────────── */
        p.draw = () => {
          if (graphRef.current.dirty) {
            graphRef.current.dirty = false;
            syncGraph();
          }

          // Smooth camera interpolation
          cam.x += (targetCam.x - cam.x) * 0.1;
          cam.y += (targetCam.y - cam.y) * 0.1;
          cam.z += (targetCam.z - cam.z) * 0.1;

          p.background(6, 6, 10);
          drawGrid();
          applyForces();

          p.push();
          p.translate(cam.x, cam.y);
          p.scale(cam.z);
          drawEdges();
          drawNodes();
          p.pop();

          drawHUD();
        };

        /* ── dot grid (screen-space, no transform) ─ */
        function drawGrid() {
          const g = 28 * cam.z;
          const ox = ((cam.x % g) + g) % g;
          const oy = ((cam.y % g) + g) % g;
          p.stroke(24, 26, 40); p.strokeWeight(1);
          for (let x = ox; x < p.width; x += g)
            for (let y = oy; y < p.height; y += g)
              p.point(x, y);
        }

        /* ── HUD: zoom level + reset button ─────── */
        function drawHUD() {
          const zPct = Math.round(cam.z * 100);
          p.noStroke();
          p.fill(255, 255, 255, 80);
          p.textSize(11); p.textAlign(p.LEFT, p.CENTER); p.textStyle(p.NORMAL);
          p.text(`${zPct}%`, 16, p.height - 18);

          // Reset button
          p.fill(255, 255, 255, 25);
          p.rect(p.width - 76, p.height - 32, 64, 22, 6);
          p.fill(255, 255, 255, 160);
          p.textAlign(p.CENTER, p.CENTER);
          p.textSize(10);
          p.text('Reset', p.width - 44, p.height - 21);
        }

        /* ── physics ─────────────────────────────── */
        function applyForces() {
          const byId = Object.fromEntries(sNodes.map(n => [n.id, n]));

          // repulsion
          for (let i = 0; i < sNodes.length; i++) {
            for (let j = i+1; j < sNodes.length; j++) {
              const a = sNodes[i], b = sNodes[j];
              const dx = b.x-a.x, dy = b.y-a.y;
              const dSq = Math.max(dx*dx+dy*dy, 100);
              const d = Math.sqrt(dSq);
              const f = 4500 / dSq;
              const fx = (dx/d)*f, fy = (dy/d)*f;
              if (a.id !== dragging?.id && !a.data?.isPinned) { a.vx -= fx; a.vy -= fy; }
              if (b.id !== dragging?.id && !b.data?.isPinned) { b.vx += fx; b.vy += fy; }
            }
          }

          // springs
          sEdges.forEach(e => {
            const a = byId[e.src], b = byId[e.tgt];
            if (!a || !b) return;
            const dx = b.x-a.x, dy = b.y-a.y;
            const d = Math.max(Math.sqrt(dx*dx+dy*dy), 1);
            const rest = (a.radius+b.radius)*3.2+110;
            const isDiffUser = a.createdById && b.createdById && a.createdById !== b.createdById;
            const k = isDiffUser ? 0.008 : 0.003; // stronger pull between different users
            const fx = (dx/d)*(d-rest)*k, fy = (dy/d)*(d-rest)*k;
            if (a.id !== dragging?.id && !a.data?.isPinned) { a.vx += fx; a.vy += fy; }
            if (b.id !== dragging?.id && !b.data?.isPinned) { b.vx -= fx; b.vy -= fy; }
          });

          // center gravity
          sNodes.forEach(n => {
            if (n.id === dragging?.id || n.data?.isPinned) return;
            n.vx += -n.x * 0.00015; n.vy += -n.y * 0.00015;
          });

          // integrate
          sNodes.forEach(n => {
            if (n.id === dragging?.id || n.data?.isPinned) return;
            n.vx *= 0.84; n.vy *= 0.84;
            n.x += n.vx; n.y += n.vy;
          });
        }

        /* ── draw edges ──────────────────────────── */
        function drawEdges() {
          const byId = Object.fromEntries(sNodes.map(n => [n.id, n]));
          sEdges.forEach(e => {
            const a = byId[e.src], b = byId[e.tgt];
            if (!a || !b) return;
            // Edge color = source node's hub color, semi-transparent
            const [r,g,bv] = hexRgb(a.palette?.hub ?? '#475569');
            p.stroke(r,g,bv, 120); p.strokeWeight(1.3/cam.z); p.noFill();
            p.line(a.x, a.y, b.x, b.y);
          });
        }

        /* ── draw nodes ──────────────────────────── */
        function drawNodes() {
          const mx = (p.mouseX - cam.x) / cam.z;
          const my = (p.mouseY - cam.y) / cam.z;

          sNodes.forEach(n => {
            const isHub     = n.degree >= 2;
            const hovered   = Math.sqrt((n.x-mx)**2+(n.y-my)**2) < Math.max(n.radius, 14);
            const hubHex    = n.palette?.hub  ?? '#7c3aed';
            const leafHex   = n.palette?.leaf ?? '#a78bfa';
            const [hr,hg,hb] = hexRgb(hubHex);
            const [lr,lg,lb] = hexRgb(leafHex);

            if (isHub) {
              // outer glow
              p.noStroke(); p.fill(hr,hg,hb, hovered ? 80 : 40);
              p.ellipse(n.x, n.y, (n.radius+20)*2);
              // circle
              p.fill(hr,hg,hb, 215); p.ellipse(n.x, n.y, n.radius*2);
              // label inside
              p.fill(255,255,255,235); p.noStroke();
              p.textAlign(p.CENTER, p.CENTER);
              p.textSize(Math.max(7, Math.min(12, n.radius/3)));
              p.textStyle(p.BOLD);
              p.text(n.label, n.x, n.y);
            } else {
              // leaf dot in leaf color
              p.noStroke(); p.fill(lr,lg,lb, hovered ? 230 : 150);
              p.ellipse(n.x, n.y, n.radius * 2);
              // label
              p.fill(lr,lg,lb, hovered ? 255 : 210);
              p.textAlign(p.CENTER, p.TOP);
              p.textSize(12); p.textStyle(p.NORMAL);
              p.text(n.label, n.x, n.y+n.radius+4);
            }
            if (n.data?.url) {
              p.fill(255, 255, 255, 180);
              p.textSize(10);
              p.textAlign(p.CENTER, p.BOTTOM);
              p.text("🔗", n.x, n.y - n.radius - 2);
            }
            if (hovered && n.data?.author) {
              p.fill(200, 200, 200, 255);
              p.textAlign(p.CENTER, p.BOTTOM);
              p.textSize(10); p.textStyle(p.ITALIC);
              p.text(`por ${n.data.author}`, n.x, n.y - (isHub ? n.radius + 24 : n.radius + 18));
            }
          });
        }

        /* ── world coords ────────────────────────── */
        function worldPos() {
          return { x: (p.mouseX-cam.x)/cam.z, y: (p.mouseY-cam.y)/cam.z };
        }
        function nodeAt() {
          const { x, y } = worldPos();
          return sNodes.find(n => {
            const r = Math.max(n.radius, 14);
            return (n.x-x)**2+(n.y-y)**2 < r*r;
          });
        }
        function isResetBtn() {
          return p.mouseX > p.width-78 && p.mouseX < p.width-10 &&
                 p.mouseY > p.height-34 && p.mouseY < p.height-10;
        }

        let dragDist = 0;

        /* ── mouse ───────────────────────────────── */
        p.mousePressed = (e) => {
          dragDist = 0;
          if (e && (e.button !== 0 || e.ctrlKey)) {
            return;
          }
          // Reset view button
          if (isResetBtn()) {
            resetView(); return;
          }
          const n = nodeAt();
          if (n) {
            dragging = n;
          } else {
            panning = true;
            panStart = { x: p.mouseX, y: p.mouseY, cx: cam.x, cy: cam.y };
          }
        };

        let lastEmit = 0;
        p.mouseDragged = () => {
          dragDist += Math.abs(p.mouseX - p.pmouseX) + Math.abs(p.mouseY - p.pmouseY);
          if (dragging) {
            const w = worldPos();
            dragging.x = w.x; dragging.y = w.y;
            dragging.vx = 0; dragging.vy = 0;
            if (Date.now() - lastEmit > 50) {
              if (cbMoveRef.current) cbMoveRef.current(dragging.id, dragging.x, dragging.y);
              lastEmit = Date.now();
            }
          } else if (panning) {
            targetCam.x = panStart.cx + (p.mouseX - panStart.x);
            targetCam.y = panStart.cy + (p.mouseY - panStart.y);
          }
        };

        p.mouseReleased = () => { 
          if (dragging) {
            if (dragDist < 5) {
              // Click
              if (cbClickRef.current) cbClickRef.current(dragging);
            } else {
              // Drag
              dragging.data = dragging.data || {};
              dragging.data.isPinned = true;
              if (cbMoveRef.current) cbMoveRef.current(dragging.id, dragging.x, dragging.y);
            }
          }
          dragging = null; 
          panning = false; 
        };

        // Smooth, gentler zoom (factor 0.97/1.03 per tick)
        p.mouseWheel = (e) => {
          const factor = e.delta > 0 ? 0.97 : 1.03;
          const newZ = Math.max(0.15, Math.min(4, targetCam.z * factor));
          // Zoom toward mouse position
          targetCam.x = p.mouseX - (p.mouseX - targetCam.x) * (newZ / targetCam.z);
          targetCam.y = p.mouseY - (p.mouseY - targetCam.y) * (newZ / targetCam.z);
          targetCam.z = newZ;
          return false;
        };

        // Fit all nodes on screen
        function resetView() {
          if (!sNodes.length) {
            targetCam = { x: p.width/2, y: p.height/2, z: 1 };
            return;
          }
          const xs = sNodes.map(n => n.x);
          const ys = sNodes.map(n => n.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const pad = 80;
          const scaleX = (p.width  - pad*2) / Math.max(maxX-minX, 1);
          const scaleY = (p.height - pad*2) / Math.max(maxY-minY, 1);
          const z = Math.max(0.15, Math.min(2, Math.min(scaleX, scaleY)));
          const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
          targetCam = { x: p.width/2 - cx*z, y: p.height/2 - cy*z, z };
        }

        p.windowResized = () => {
          if (containerRef.current)
            p.resizeCanvas(containerRef.current.offsetWidth, containerRef.current.offsetHeight);
        };
      };

      inst = new p5(sketch, containerRef.current);
    }); // end import('p5').then

    return () => {
      cancelled = true;
      if (inst) inst.remove();
    };
  }, []);

  return <div ref={containerRef} style={{ width:'100%', height:'100%' }} />;
}
