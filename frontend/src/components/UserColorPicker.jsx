import { useState, useRef, useEffect } from 'react';

export const PALETTES = [
  { name: 'Violeta',  hub: '#7c3aed', leaf: '#a78bfa' },
  { name: 'Azul',     hub: '#0369a1', leaf: '#38bdf8' },
  { name: 'Verde',    hub: '#047857', leaf: '#34d399' },
  { name: 'Ámbar',    hub: '#b45309', leaf: '#fbbf24' },
  { name: 'Rosa',     hub: '#be123c', leaf: '#fb7185' },
  { name: 'Cyan',     hub: '#0e7490', leaf: '#22d3ee' },
  { name: 'Índigo',   hub: '#3730a3', leaf: '#818cf8' },
  { name: 'Naranja',  hub: '#c2410c', leaf: '#fb923c' },
];

const STORAGE_KEY = (uid) => `muse_color_${uid}`;

export function getUserPalette(userId) {
  if (!userId) return PALETTES[0];
  const saved = localStorage.getItem(STORAGE_KEY(userId));
  if (saved !== null) return PALETTES[parseInt(saved)] ?? PALETTES[0];
  // deterministic default
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function saveUserPalette(userId, index) {
  localStorage.setItem(STORAGE_KEY(userId), index);
}

export default function UserColorPicker({ user, onColorChange }) {
  const [open, setOpen]       = useState(false);
  const [selIdx, setSelIdx]   = useState(() => {
    const s = localStorage.getItem(STORAGE_KEY(user?.id));
    if (s !== null) return parseInt(s);
    let h = 0;
    const uid = user?.id ?? '';
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return h % PALETTES.length;
  });
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (i) => {
    setSelIdx(i);
    saveUserPalette(user?.id, i);
    onColorChange?.(i);
    setOpen(false);
  };

  const palette = PALETTES[selIdx];

  return (
    <div className="relative" ref={panelRef}>
      {/* Avatar button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Tu color"
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-all"
      >
        <div
          className="w-5 h-5 rounded-full ring-2 ring-white/20"
          style={{ background: palette.hub }}
        />
        <span className="text-xs text-gray-400 font-medium hidden sm:block">
          {user?.name?.split(' ')[0] ?? 'Tú'}
        </span>
      </button>

      {/* Color panel */}
      {open && (
        <div className="absolute right-0 top-10 z-50 bg-[#111] border border-white/10 rounded-2xl shadow-2xl p-4 w-56">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-3">
            Tu color en el mapa
          </p>
          <div className="grid grid-cols-4 gap-2">
            {PALETTES.map((p, i) => (
              <button
                key={i}
                onClick={() => select(i)}
                title={p.name}
                className="relative w-10 h-10 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{ background: p.hub }}
              >
                {selIdx === i && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7l3.5 3.5L12 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Preview strip */}
          <div className="mt-3 flex gap-2 items-center">
            <div className="w-7 h-7 rounded-full" style={{ background: palette.hub }} />
            <div className="w-5 h-5 rounded-full" style={{ background: palette.leaf }} />
            <span className="text-xs text-gray-500 ml-1">{palette.name}</span>
          </div>
        </div>
      )}
    </div>
  );
}
