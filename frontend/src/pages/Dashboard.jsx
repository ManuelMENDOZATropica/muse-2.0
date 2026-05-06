import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PlusCircle, Folder, Sparkles, Trash2, Pencil, MoreVertical, Check, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://muse-2-0.onrender.com';

export default function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [briefFile, setBriefFile] = useState(null);
  const [researchFile, setResearchFile] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(null); // project id with open menu
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const navigate = useNavigate();
  const menuRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/api/users/${user.id}/projects`)
      .then(res => res.json())
      .then(data => { setProjects(data); setLoading(false); });
  }, [user]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setIsCreating(true);
    
    const formData = new FormData();
    formData.append('title', newTitle);
    formData.append('ownerId', user.id);
    if (briefFile) formData.append('brief', briefFile);
    if (researchFile) formData.append('research', researchFile);

    try {
      const res = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create project');
      }
      const newProject = await res.json();
      navigate(`/project/${newProject.id}`);
    } catch(e) {
      console.error('Create error:', e);
      alert('Error creating project: ' + e.message);
      setIsCreating(false);
    }
  };

  const handleDelete = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    await fetch(`${API_URL}/api/projects/${projectId}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setMenuOpen(null);
  };

  const startRename = (p, e) => {
    e.stopPropagation();
    setRenamingId(p.id);
    setRenameValue(p.title);
    setMenuOpen(null);
  };

  const handleRename = async (projectId, e) => {
    e?.stopPropagation();
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameValue })
    });
    const updated = await res.json();
    setProjects(prev => prev.map(p => p.id === projectId ? updated : p));
    setRenamingId(null);
  };

  const renderAvatars = (p) => {
    const usersMap = new Map();
    if (p.owner) usersMap.set(p.owner.id, p.owner);
    if (p.nodes) {
      p.nodes.forEach(n => {
        if (n.createdBy) usersMap.set(n.createdBy.id, n.createdBy);
      });
    }
    const contributors = Array.from(usersMap.values());
    if (contributors.length === 0) return null;

    return (
      <div className="absolute bottom-4 right-4 flex -space-x-2" onClick={e => e.stopPropagation()}>
        {contributors.slice(0, 3).map((u, i) => (
          <img
            key={u.id}
            src={u.avatar || `https://ui-avatars.com/api/?name=${u.name}&background=random`}
            alt={u.name || 'User'}
            title={u.name || 'User'}
            className="w-7 h-7 rounded-full border-2 border-[#1a1a1a] shadow-sm bg-gray-700"
            style={{ zIndex: 10 - i }}
          />
        ))}
        {contributors.length > 3 && (
          <div className="w-7 h-7 rounded-full border-2 border-[#1a1a1a] bg-gray-800 text-[10px] font-medium text-white flex items-center justify-center" style={{ zIndex: 0 }}>
            +{contributors.length - 3}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-8 pt-20">
      <div className="flex items-center gap-4 mb-12">
        <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shadow-sm">
          <Sparkles className="text-[#A1A1AA] w-5 h-5" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-[#FAFAFA]">
          Welcome, {user.name}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create New */}
        <form onSubmit={handleCreate} className="bg-[#18181B]/40 border border-white/[0.08] rounded-2xl p-6 flex flex-col justify-between hover:bg-[#18181B]/60 transition-all group shadow-xl">
          <div>
            <h2 className="text-lg font-semibold mb-1 text-[#FAFAFA] tracking-tight">New Project</h2>
            <p className="text-[#A1A1AA] text-sm mb-6">Start a creative exploration</p>
            <input
              type="text"
              placeholder="Project Name..."
              className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-[#FAFAFA] text-sm focus:outline-none focus:border-white/20 transition-all mb-6 placeholder:text-[#52525B]"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
            
            <div className="mb-5">
              <label className="block text-xs font-medium text-[#A1A1AA] mb-2">Brief del Proyecto (PDF/TXT)</label>
              <input 
                type="file" 
                accept=".txt,.pdf"
                onChange={e => setBriefFile(e.target.files[0])}
                className="w-full text-xs text-[#A1A1AA] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[#E4E4E7] hover:file:bg-white/[0.1] cursor-pointer transition-colors"
              />
            </div>

            <div className="mb-8">
              <label className="block text-xs font-medium text-[#A1A1AA] mb-2">Investigación Profunda (PDF/TXT)</label>
              <input 
                type="file" 
                accept=".txt,.pdf"
                onChange={e => setResearchFile(e.target.files[0])}
                className="w-full text-xs text-[#A1A1AA] file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-white/[0.06] file:text-[#E4E4E7] hover:file:bg-white/[0.1] cursor-pointer transition-colors"
              />
            </div>
          </div>
          <button type="submit" disabled={isCreating} className="w-full bg-[#FAFAFA] text-black font-medium text-sm rounded-xl py-3 hover:bg-[#E4E4E7] transition-colors disabled:opacity-50 shadow-sm flex items-center justify-center gap-2">
            {isCreating ? <span className="animate-pulse">Initializing...</span> : <><PlusCircle size={18} /> Create Workspace</>}
          </button>
        </form>

        {loading ? (
          <div className="col-span-2 flex items-center justify-center text-gray-500">Loading projects...</div>
        ) : (
          Array.isArray(projects) ? projects.map(p => (
            <div
              key={p.id}
              onClick={() => renamingId !== p.id && navigate(`/project/${p.id}`)}
              className="bg-[#18181B]/40 border border-white/[0.08] rounded-2xl p-6 cursor-pointer hover:bg-[#18181B]/60 hover:border-white/[0.12] transition-all group relative flex flex-col justify-between shadow-xl"
            >

              {/* ··· menu button */}
              <button
                className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors z-10"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id); }}
              >
                <MoreVertical size={16} />
              </button>

              {/* Dropdown menu */}
              {menuOpen === p.id && (
                <div
                  ref={menuRef}
                  className="absolute top-12 right-4 z-20 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-1 w-44 flex flex-col overflow-hidden"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    className="px-4 py-2.5 text-sm text-left text-gray-300 hover:bg-white/10 flex items-center gap-2"
                    onClick={(e) => startRename(p, e)}
                  >
                    <Pencil size={14} /> Renombrar
                  </button>
                  <button
                    className="px-4 py-2.5 text-sm text-left text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                    onClick={(e) => handleDelete(p.id, e)}
                  >
                    <Trash2 size={14} /> Eliminar
                  </button>
                </div>
              )}

              <div>
                <Folder className="text-[#A1A1AA] mb-4" size={24} strokeWidth={1.5} />

                {renamingId === p.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 bg-black/40 border border-[#A1A1AA] rounded-md px-2 py-1 text-[#FAFAFA] text-sm focus:outline-none"
                    />
                    <button onClick={() => handleRename(p.id)} className="text-emerald-400 hover:text-emerald-300"><Check size={16} /></button>
                    <button onClick={() => setRenamingId(null)} className="text-[#A1A1AA] hover:text-white"><X size={16} /></button>
                  </div>
                ) : (
                  <h3 className="text-lg font-semibold text-[#FAFAFA] tracking-tight mb-1 pr-6">{p.title}</h3>
                )}
                <p className="text-xs text-[#52525B] mt-1">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
              </div>

              {/* Render contributors avatars at bottom right */}
              {renderAvatars(p)}
            </div>
          )) : (
            <div className="col-span-2 flex items-center justify-center text-red-500">Error loading projects.</div>
          )
        )}
      </div>
    </div>
  );
}
