import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Plus, Folder, Sparkles, Trash2, Pencil, MoreVertical, Check, X,
  FileText, Network, MessageSquare, Clock, ChevronRight, Upload
} from 'lucide-react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'https://muse-2-0.onrender.com';

// ── Creation overlay driven by real server events ────────────────────────────
function CreationOverlay({ creationSocket, creationId }) {
  const [steps, setSteps] = useState([
    { id: 'init', label: 'Iniciando...', done: false, active: true }
  ]);
  const [progress, setProgress] = useState(5);

  useEffect(() => {
    if (!creationSocket || !creationId) return;
    const handler = ({ step, message }) => {
      setSteps(prev => {
        // Mark all previous as done, add new active
        const updated = prev.map(s => ({ ...s, active: false, done: true }));
        // Only add if not already there
        const alreadyExists = updated.find(s => s.id === step);
        if (alreadyExists) return prev;
        return [...updated, { id: step, label: message, done: false, active: true }];
      });
      // Progress: steps 1-7, map to 0-95%
      setProgress(Math.min(95, Math.round((step / 7) * 100)));
    };
    creationSocket.on('creation_progress', handler);
    return () => creationSocket.off('creation_progress', handler);
  }, [creationSocket, creationId]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050507]/95 backdrop-blur-xl flex items-center justify-center">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* Animated logo */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-white/[0.03] border border-white/[0.08] animate-pulse" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[#A1A1AA]" style={{ animation: 'spin 3s linear infinite' }} />
          </div>
        </div>

        {/* Steps — real events */}
        <div className="space-y-2">
          {steps.map((s) => (
            <div key={s.id}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-400 ${
                s.active ? 'bg-white/[0.06] border border-white/[0.1]' : s.done ? 'opacity-40' : 'opacity-20'
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 transition-colors duration-300 ${
                s.done ? 'bg-emerald-400' : s.active ? 'bg-white animate-pulse' : 'bg-white/20'
              }`} />
              <span className={`text-sm font-medium text-left ${
                s.active ? 'text-[#FAFAFA]' : 'text-[#A1A1AA]'
              }`}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Real progress bar */}
        <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-white/40 rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [briefFile, setBriefFile] = useState(null);
  const [researchFile, setResearchFile] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onCreate({ title, briefFile, researchFile });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-[#111113] border border-white/[0.08] rounded-2xl shadow-2xl p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-[#FAFAFA]">Nuevo Proyecto</h2>
            <p className="text-xs text-[#71717A] mt-0.5">Comienza una exploración creativa</p>
          </div>
          <button onClick={onClose} className="text-[#52525B] hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/[0.05]">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-[#A1A1AA] mb-2">Nombre del proyecto</label>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ej. NYX Pride 2026..."
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-[#FAFAFA] text-sm focus:outline-none focus:border-white/20 transition-all placeholder:text-[#3F3F46]"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
            />
          </div>

          {/* Brief */}
          <div>
            <label className="block text-xs font-medium text-[#A1A1AA] mb-2 flex items-center gap-1.5">
              <FileText size={11} /> Brief del Proyecto
              <span className="text-[#3F3F46] font-normal">(PDF/TXT · Opcional)</span>
            </label>
            <label className="flex items-center gap-3 w-full px-4 py-3 bg-black/20 border border-white/[0.06] border-dashed rounded-xl cursor-pointer hover:border-white/20 hover:bg-white/[0.02] transition-all group">
              <Upload size={14} className="text-[#52525B] group-hover:text-[#A1A1AA] transition-colors" />
              <span className="text-xs text-[#52525B] group-hover:text-[#71717A] transition-colors truncate">
                {briefFile ? briefFile.name : 'Haz clic para subir'}
              </span>
              <input type="file" accept=".txt,.pdf" className="hidden" onChange={e => setBriefFile(e.target.files[0])} />
            </label>
          </div>

          {/* Research */}
          <div>
            <label className="block text-xs font-medium text-[#A1A1AA] mb-2 flex items-center gap-1.5">
              <Network size={11} /> Investigación Profunda
              <span className="text-[#3F3F46] font-normal">(PDF/TXT · Genera mapa inicial)</span>
            </label>
            <label className="flex items-center gap-3 w-full px-4 py-3 bg-black/20 border border-white/[0.06] border-dashed rounded-xl cursor-pointer hover:border-white/20 hover:bg-white/[0.02] transition-all group">
              <Upload size={14} className="text-[#52525B] group-hover:text-[#A1A1AA] transition-colors" />
              <span className="text-xs text-[#52525B] group-hover:text-[#71717A] transition-colors truncate">
                {researchFile ? researchFile.name : 'Haz clic para subir'}
              </span>
              <input type="file" accept=".txt,.pdf" className="hidden" onChange={e => setResearchFile(e.target.files[0])} />
            </label>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-4">
            <button type="submit" disabled={!title.trim()}
              className="w-full py-3 text-sm font-medium bg-[#FAFAFA] text-black rounded-xl hover:bg-[#E4E4E7] transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              <Plus size={15} /> Crear Workspace
            </button>
            
            <button type="button" 
              disabled={!title.trim()}
              onClick={(e) => { e.preventDefault(); if (title.trim()) onCreate({ title, briefFile: null, researchFile: null }); }}
              className="w-full py-3 text-sm font-medium bg-black/20 text-[#A1A1AA] border border-white/[0.08] rounded-xl hover:bg-white/[0.04] hover:text-white transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
              <Plus size={15} /> Crear vacío (Sin docs)
            </button>

            <button type="button" onClick={onClose}
              className="w-full py-2 mt-2 text-xs font-medium text-[#52525B] hover:text-[#A1A1AA] transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [creationSocket, setCreationSocket] = useState(null);
  const [creationId, setCreationId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/api/users/${user.id}/projects`)
      .then(res => res.json())
      .then(data => { setProjects(data); setLoading(false); });
  }, [user]);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreate = async ({ title, briefFile, researchFile }) => {
    setShowModal(false);

    // Generate unique creation ID and connect socket BEFORE the POST
    const cid = `${user.id}_${Date.now()}`;
    const sock = io(API_URL);
    sock.emit('join_creation', cid);
    setCreationId(cid);
    setCreationSocket(sock);
    setIsCreating(true);

    const formData = new FormData();
    formData.append('title', title);
    formData.append('ownerId', user.id);
    formData.append('creationId', cid);
    if (briefFile) formData.append('brief', briefFile);
    if (researchFile) formData.append('research', researchFile);

    try {
      const res = await fetch(`${API_URL}/api/projects`, { method: 'POST', body: formData });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      const newProject = await res.json();
      setTimeout(() => { sock.disconnect(); navigate(`/project/${newProject.id}`); }, 600);
    } catch(e) {
      console.error('Create error:', e);
      alert('Error al crear el proyecto: ' + e.message);
      sock.disconnect();
      setIsCreating(false);
      setCreationSocket(null);
      setCreationId(null);
    }
  };

  const handleDelete = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    await fetch(`${API_URL}/api/projects/${projectId}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setMenuOpen(null);
  };

  const startRename = (p, e) => { e.stopPropagation(); setRenamingId(p.id); setRenameValue(p.title); setMenuOpen(null); };
  const handleRename = async (projectId) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameValue })
    });
    const updated = await res.json();
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updated } : p));
    setRenamingId(null);
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const d = Math.floor(diff / 86400000);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff / 60000);
    if (d > 0) return `hace ${d}d`;
    if (h > 0) return `hace ${h}h`;
    if (m > 0) return `hace ${m}m`;
    return 'ahora';
  };

  return (
    <>
      {/* Creation overlay */}
      {isCreating && <CreationOverlay creationSocket={creationSocket} creationId={creationId} />}

      {/* New project modal */}
      {showModal && <NewProjectModal onClose={() => setShowModal(false)} onCreate={handleCreate} />}

      <div className="min-h-screen bg-[#0A0A0A]">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0A0A0A]/80 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 ml-12">
              <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
                <Sparkles size={13} className="text-[#A1A1AA]" />
              </div>
              <span className="text-sm font-semibold text-[#FAFAFA] tracking-tight">Muse</span>
            </div>
            <div className="flex items-center gap-3">
              <img
                src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=random`}
                alt={user.name}
                className="w-7 h-7 rounded-full border border-white/10"
              />
              <span className="text-xs text-[#71717A]">{user.name?.split(' ')[0]}</span>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-8 pt-14 pb-20">
          {/* Title row */}
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-xs text-[#52525B] font-medium uppercase tracking-widest mb-2">Dashboard</p>
              <h1 className="text-3xl font-semibold text-[#FAFAFA] tracking-tight">
                Hola, {user.name?.split(' ')[0]} 👋
              </h1>
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#FAFAFA] text-black text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#E4E4E7] transition-all shadow-sm"
            >
              <Plus size={16} /> Nuevo proyecto
            </button>
          </div>

          {/* Project grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-44 bg-white/[0.02] border border-white/[0.06] rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : !projects.length ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
                <Network size={32} className="text-[#3F3F46]" strokeWidth={1.2} />
              </div>
              <h2 className="text-lg font-semibold text-[#FAFAFA] mb-2">Sin proyectos todavía</h2>
              <p className="text-sm text-[#52525B] mb-8 max-w-xs">
                Crea tu primer workspace y empieza a construir mapas de ideas con IA.
              </p>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-[#FAFAFA] text-black text-sm font-semibold px-5 py-3 rounded-xl hover:bg-[#E4E4E7] transition-all">
                <Plus size={16} /> Crear primer proyecto
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => renamingId !== p.id && navigate(`/project/${p.id}`)}
                  className="bg-[#111113] border border-white/[0.06] rounded-2xl p-5 cursor-pointer hover:bg-[#18181B] hover:border-white/[0.1] transition-all group relative flex flex-col justify-between shadow-xl min-h-[172px]"
                >
                  {/* Menu button */}
                  <button
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-[#3F3F46] hover:text-white hover:bg-white/[0.06] transition-colors z-10 opacity-0 group-hover:opacity-100"
                    onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
                    title="Opciones"
                  >
                    <MoreVertical size={15} />
                  </button>

                  {/* Dropdown */}
                  {menuOpen === p.id && (
                    <div ref={menuRef}
                      className="absolute top-12 right-4 z-20 bg-[#1a1a1a] border border-white/[0.08] rounded-xl shadow-2xl py-1.5 w-40 flex flex-col overflow-hidden"
                      onClick={e => e.stopPropagation()}>
                      <button className="px-4 py-2 text-sm text-left text-[#E4E4E7] hover:bg-white/[0.06] flex items-center gap-2.5"
                        onClick={e => startRename(p, e)}>
                        <Pencil size={13} /> Renombrar
                      </button>
                      <button className="px-4 py-2 text-sm text-left text-red-400 hover:bg-red-500/10 flex items-center gap-2.5"
                        onClick={e => handleDelete(p.id, e)}>
                        <Trash2 size={13} /> Eliminar
                      </button>
                    </div>
                  )}

                  {/* Content */}
                  <div>
                    <Folder className="text-[#52525B] mb-3" size={20} strokeWidth={1.5} />
                    {renamingId === p.id ? (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        <input autoFocus value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                          className="flex-1 bg-black/40 border border-[#A1A1AA] rounded-md px-2 py-1 text-[#FAFAFA] text-sm focus:outline-none"
                        />
                        <button onClick={() => handleRename(p.id)} className="text-emerald-400 hover:text-emerald-300"><Check size={14} /></button>
                        <button onClick={() => setRenamingId(null)} className="text-[#52525B] hover:text-white"><X size={14} /></button>
                      </div>
                    ) : (
                      <h3 className="text-sm font-semibold text-[#FAFAFA] tracking-tight mb-0.5 pr-6 line-clamp-2">{p.title}</h3>
                    )}
                  </div>

                  {/* Stats footer */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/[0.05]">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[11px] text-[#52525B]" title="Nodos">
                        <Network size={10} /> {p._count?.nodes ?? p.nodes?.length ?? 0}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-[#52525B]" title="Mensajes">
                        <MessageSquare size={10} /> {p._count?.messages ?? 0}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-[#3F3F46]">
                      <Clock size={10} /> {timeAgo(p.updatedAt)}
                    </span>
                  </div>
                </div>
              ))}

              {/* New project card */}
              <button onClick={() => setShowModal(true)}
                className="bg-white/[0.01] border border-dashed border-white/[0.08] rounded-2xl p-5 cursor-pointer hover:bg-white/[0.03] hover:border-white/[0.15] transition-all group flex flex-col items-center justify-center gap-3 min-h-[172px]">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center group-hover:bg-white/[0.08] transition-colors">
                  <Plus size={18} className="text-[#52525B] group-hover:text-[#A1A1AA] transition-colors" />
                </div>
                <span className="text-xs font-medium text-[#3F3F46] group-hover:text-[#71717A] transition-colors">Nuevo proyecto</span>
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
