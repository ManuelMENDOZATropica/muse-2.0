// UserColorPicker.jsx — palettes kept for NetworkMap compatibility
// The interactive picker has been replaced by UsersLegend in the header

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

export function getUserPalette(userId) {
  if (!userId) return PALETTES[0];
  // Deterministic palette based on userId hash
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

// ── UsersLegend: read-only list of users and their colors ────────────────────
export default function UsersLegend({ nodes }) {
  // Collect unique users from nodes that have a createdById
  const usersMap = {};
  (nodes || []).forEach(n => {
    const uid = n.createdById ?? n.data?.createdById;
    const name = n.data?.author;
    if (uid && name && name !== 'MAGNUM' && !usersMap[uid]) {
      usersMap[uid] = { uid, name, palette: getUserPalette(uid) };
    }
  });
  const users = Object.values(usersMap);

  if (!users.length) return null;

  return (
    <div className="flex items-center gap-2">
      {users.map(u => (
        <div
          key={u.uid}
          title={u.name}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04]"
        >
          <div
            className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
            style={{ background: u.palette.hub }}
          />
          <span className="text-xs text-[#A1A1AA] font-medium max-w-[80px] truncate">
            {u.name.split(' ')[0]}
          </span>
        </div>
      ))}
    </div>
  );
}
