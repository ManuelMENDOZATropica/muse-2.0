import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PlusCircle, Folder, Sparkles, Trash2, Pencil, MoreVertical, Check, X } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'https://muse-2-0.onrender.com';

export default function Dashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [newTitle, setNewTitle] = useState('');
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
    const res = await fetch(`${API_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, ownerId: user.id })
    });
    const newProject = await res.json();
    navigate(`/project/${newProject.id}`);
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
      <div className="flex items-center gap-3 mb-12">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Sparkles className="text-white w-6 h-6" />
        </div>
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
          Welcome, {user.name}
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Create New */}
        <form onSubmit={handleCreate} className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 flex flex-col justify-between hover:bg-white/[0.04] transition-all group shadow-xl">
          <div>
            <h2 className="text-xl font-semibold mb-2">New Project</h2>
            <p className="text-gray-400 text-sm mb-6">Start a new creative exploration with Muse.</p>
            <input
              type="text"
              placeholder="Project Name..."
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all mb-4"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
          </div>
          <button type="submit" className="w-full bg-white text-black font-semibold rounded-xl py-3 flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors">
            <PlusCircle size={20} /> Create Workspace
          </button>
        </form>

        {loading ? (
          <div className="col-span-2 flex items-center justify-center text-gray-500">Loading projects...</div>
        ) : (
          projects.map(p => (
            <div
              key={p.id}
              onClick={() => renamingId !== p.id && navigate(`/project/${p.id}`)}
              className="bg-white/[0.02] border border-white/10 rounded-3xl p-6 cursor-pointer hover:border-purple-500/50 hover:bg-white/[0.04] transition-all group relative overflow-hidden flex flex-col justify-between shadow-xl"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>

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
                <Folder className="text-purple-400 mb-4" size={28} />

                {renamingId === p.id ? (
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(p.id); if (e.key === 'Escape') setRenamingId(null); }}
                      className="flex-1 bg-white/10 border border-purple-500 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
                    />
                    <button onClick={() => handleRename(p.id)} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
                    <button onClick={() => setRenamingId(null)} className="text-gray-500 hover:text-white"><X size={14} /></button>
                  </div>
                ) : (
                  <h3 className="text-xl font-bold mb-2 pr-6">{p.title}</h3>
                )}
                <p className="text-xs text-gray-500 mt-2">Updated {new Date(p.updatedAt).toLocaleDateString()}</p>
              </div>

              {/* Render contributors avatars at bottom right */}
              {renderAvatars(p)}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
