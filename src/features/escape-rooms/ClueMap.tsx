import { graphColumns, type Blueprint, type ClueStatus } from './model';

export default function ClueMap({ blueprint, states = {}, selected, onSelect }: {
  blueprint: Blueprint; states?: Record<string, ClueStatus>; selected: string; onSelect: (id: string) => void;
}) {
  const columns = graphColumns(blueprint.nodes);
  const positions = new Map(columns.flatMap((col, x) => col.map((node, y) => [node.id, { x: x * 265 + 24, y: y * 145 + 24 }] as const)));
  const width = Math.max(650, columns.length * 265 + 24);
  const height = Math.max(330, ...columns.map(c => c.length * 145 + 24));
  return <div className="er-map-scroll" tabIndex={0} aria-label="Clue path. Scroll horizontally to explore. Select a node to inspect it.">
    <div className="er-map" style={{ width, height }}>
      <svg width={width} height={height} aria-hidden="true">
        <defs><marker id="er-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#8c9aaa" /></marker></defs>
        {blueprint.nodes.flatMap(node => [...node.requires.map(r => ({ id: r.nodeId, item: false })), ...node.keyIds.filter(id => !node.requires.some(r => r.nodeId === id)).map(id => ({ id, item: true }))].map(ref => {
          const from = positions.get(ref.id); const to = positions.get(node.id);
          if (!from || !to) return null;
          const x = from.x + 218; const y = from.y + 54;
          return <path key={`${ref.id}-${node.id}`} d={`M${x},${y} C${x + 30},${y} ${to.x - 30},${to.y + 54} ${to.x - 5},${to.y + 54}`} fill="none" stroke={states[ref.id] === 'used' ? '#a3c582' : '#64748b'} strokeWidth="1.5" strokeDasharray={ref.item ? '5 5' : undefined} markerEnd="url(#er-arrow)" />;
        }))}
      </svg>
      {blueprint.nodes.map(node => {
        const pos = positions.get(node.id)!; const status = states[node.id] ?? 'hidden';
        return <button key={node.id} className={`er-map-node er-${status} ${selected === node.id ? 'selected' : ''}`} style={{ left: pos.x, top: pos.y }} onClick={() => onSelect(node.id)} aria-pressed={selected === node.id}>
          <span className="er-node-meta">{node.kind} · {status}</span><strong>{node.title}</strong><small>{node.location || 'Location not set'}</small>
          <span className="er-node-rule">{node.requires.length ? `${node.gate === 'all' ? 'ALL' : 'ANY'} ${node.requires.length} paths` : 'Starting point'} · {node.reveal}</span>
        </button>;
      })}
    </div>
  </div>;
}
