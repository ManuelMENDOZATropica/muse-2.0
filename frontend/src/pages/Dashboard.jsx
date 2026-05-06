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
      <div className="flex items-center gap-4 mb-16">
        <div className="w-10 h-10 rounded-full border-[0.5px] border-white/20 flex items-center justify-center">
          <Sparkles className="text-white w-4 h-4" />
        </div>
        <h1 className="text-2xl font-bold uppercase tracking-[0.2em] text-white">
          Welcome, {user.name}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create New */}
        <form onSubmit={handleCreate} className="bg-black border-[0.5px] border-white/20 p-8 flex flex-col justify-between hover:border-cyan-400 hover:bg-cyan-400/[0.02] transition-all group relative">
          <div className="absolute top-0 right-0 w-3 h-3 border-t-[0.5px] border-r-[0.5px] border-white/40 m-2"></div>
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[0.5px] border-l-[0.5px] border-white/40 m-2"></div>
          
          <div>
            <h2 className="text-sm uppercase tracking-widest font-semibold mb-2 text-white">New Project</h2>
            <p className="text-gray-500 text-xs uppercase tracking-widest mb-8">Start a creative exploration</p>
            <input
              type="text"
              placeholder="PROJECT NAME"
              className="w-full bg-transparent border-b-[0.5px] border-white/20 px-0 py-3 text-white uppercase tracking-wider text-sm focus:outline-none focus:border-cyan-400 transition-colors mb-8 placeholder:text-white/20"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              required
            />
            
            <div className="mb-6">
              <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2">Brief del Proyecto (PDF/TXT)</label>
              <input 
                type="file" 
                accept=".txt,.pdf"
                onChange={e => setBriefFile(e.target.files[0])}
                className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-[0.5px] file:border-white/20 file:bg-transparent file:text-white hover:file:bg-white/10 cursor-pointer transition-colors"
              />
            </div>

            <div className="mb-8">
              <label className="block text-[10px] uppercase tracking-widest text-gray-500 mb-2">Investigación Profunda (PDF/TXT)</label>
              <input 
                type="file" 
                accept=".txt,.pdf"
                onChange={e => setResearchFile(e.target.files[0])}
                className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-[0.5px] file:border-white/20 file:bg-transparent file:text-white hover:file:bg-white/10 cursor-pointer transition-colors"
              />
            </div>
          </div>
          <button type="submit" disabled={isCreating} className="w-full border-[0.5px] border-white/40 bg-transparent text-white uppercase tracking-widest text-[10px] rounded-full py-3 hover:bg-white hover:text-black transition-colors disabled:opacity-50">
            {isCreating ? <span className="animate-pulse">INITIALIZING...</span> : 'CREATE WORKSPACE'}
          </button>
        </form>

        {loading ? (
          <div className="col-span-2 flex items-center justify-center text-gray-500">Loading projects...</div>
        ) : (
          Array.isArray(projects) ? projects.map(p => (
            <div
              key={p.id}
              onClick={() => renamingId !== p.id && navigate(`/project/${p.id}`)}
              className="bg-black border-[0.5px] border-white/20 p-8 cursor-pointer hover:border-cyan-400 hover:bg-cyan-400/[0.02] transition-all group relative overflow-hidden flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 w-3 h-3 border-t-[0.5px] border-r-[0.5px] border-white/40 m-2"></div>
              <div className="absolute bottom-0 left-0 w-3 h-3 border-b-[0.5px] border-l-[0.5px] border-white/40 m-2"></div>

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
                <Folder className="text-white/40 mb-6" size={20} strokeWidth={1.5} />

                {renamingId === p.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 bg-transparent border-b-[0.5px] border-cyan-400 px-0 py-1 text-white text-sm uppercase tracking-widest focus:outline-none"
                    />
                    <button onClick={() => handleRename(p.id)} className="text-white hover:text-cyan-400"><Check size={14} /></button>
                    <button onClick={() => setRenamingId(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                  </div>
                ) : (
                  <h3 className="text-lg font-semibold uppercase tracking-widest mb-2 pr-6">{p.title}</h3>
                )}
                <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-2">UPDATED {new Date(p.updatedAt).toLocaleDateString()}</p>
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
