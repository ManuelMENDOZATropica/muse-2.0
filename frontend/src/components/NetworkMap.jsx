import { useEffect, useRef, useState } from 'react';
// p5 disabled temporarily for production debugging
// import p5 from 'p5';
import { getUserPalette } from './UserColorPicker';

function hexRgb(hex) {
  if (!hex || hex.length < 7) return [120, 120, 120];
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

export default function NetworkMap({ nodes, edges, onNodeRightClick, currentUserId, colorVersion }) {
  const containerRef = useRef(null);
  const graphRef     = useRef({ nodes: [], edges: [], dirty: false });
  const cbRef        = useRef(onNodeRightClick);

  useEffect(() => { cbRef.current = onNodeRightClick; }, [onNodeRightClick]);
  useEffect(() => {
    graphRef.current = { nodes, edges, dirty: true };
  }, [nodes, edges]);
  // When user changes color, trigger re-sync so node palettes update
  useEffect(() => {
    graphRef.current = { ...graphRef.current, dirty: true };
  }, [colorVersion]);

  /* p5 DISABLED FOR DEBUGGING — replaced with placeholder */

  return (
    <div ref={containerRef} style={{ width:'100%', height:'100%', background: '#06060a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#555', fontSize: 14 }}>Network Map (p5 disabled for debugging)</p>
    </div>
  );
}
