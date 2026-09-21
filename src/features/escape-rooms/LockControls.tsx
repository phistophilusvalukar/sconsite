import { useState } from 'react';
import { Check } from 'lucide-react';
import EscapeLockPicker from './EscapeLockPicker';
import type { PublicNode, PuzzleSession } from './model';
import type { RoomCommand } from './service';

export default function LockControls({ node, session, busy, command }: { node: PublicNode; session: PuzzleSession; busy: boolean; command: RoomCommand }) {
  const [code, setCode] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  if (node.status === 'used') return <p className="er-complete"><Check size={18} />{node.kind === 'treasure' ? 'Treasure claimed' : 'Solved / opened by the party'}</p>;
  return <section className="er-lock-controls">
    <form className="er-unlock" onSubmit={e => { e.preventDefault(); void command({ type: 'unlock', nodeId: node.id, code, itemIds: items }); }}>
      <h3>{node.kind === 'treasure' ? 'Claim the discovery' : node.keyhole && node.needsCode ? 'Code and keyhole lock' : node.keyhole ? 'Keyhole lock' : node.needsCode ? 'Code lock' : 'Open the way'}</h3>
      {(node.needsCode || node.keyhole) && <p>The mechanism is embedded in the {node.kind === 'room' ? 'door or wall' : 'object'}. It cannot be removed or smashed like a padlock.</p>}
      {node.mechanism.jammed && <p className="er-error" role="status">Jammed after three failed picks. Picking is permanently disabled for this lock; use the actual key.</p>}
      {node.mechanism.picked && <p className="er-complete">The key mechanism is picked. The code is still required.</p>}
      {node.needsCode && <label>Answer or code<input maxLength={120} value={code} autoComplete="off" onChange={e => setCode(e.target.value)} placeholder="Enter your answer" /></label>}
      {node.needsItems && <fieldset><legend>Try keys / items from the shared stash</legend>{session.nodes.filter(n => n.kind === 'item').map(n => <label className="er-checkbox" key={n.id}><input type="checkbox" checked={items.includes(n.id)} onChange={e => setItems(e.target.checked ? [...items, n.id] : items.filter(id => id !== n.id))} />{n.title}</label>)}{!session.nodes.some(n => n.kind === 'item') && <p>No items discovered yet. You may be able to pick the keyhole instead.</p>}</fieldset>}
      <button className="er-primary" disabled={busy || session.status !== 'active'}>{busy ? 'Checking…' : node.kind === 'treasure' ? 'Claim treasure' : node.needsItems ? 'Try selected keys / code' : node.needsCode ? 'Try code' : 'Open / solve'}</button>
    </form>
    {node.pickable && !node.mechanism.picked && <div className="er-unlock"><button type="button" disabled={node.mechanism.jammed || session.status !== 'active'} onClick={() => setPicking(!picking)}>{picking ? 'Close lockpicking tools' : 'Try picking the lock'}</button><small>{node.pickDifficulty} mechanism · {node.mechanism.failures}/3 failed picks, shared by the party. Closing the tools does not restore durability.</small>{picking && !node.mechanism.jammed && <EscapeLockPicker node={node} active={session.status === 'active'} command={command} />}</div>}
    {['room', 'container'].includes(node.kind) && <div className="er-unlock"><h3>Force the {node.kind === 'room' ? 'door' : 'container'}</h3><p>{node.forcePolicy === 'reinforced' ? 'Magical reinforcement prevents forced entry.' : node.forcePolicy === 'allowed' ? 'Request a forced-entry attempt. Your GM resolves the check in Foundry.' : 'This object is not configured for forced entry.'} Attempts may trigger traps or glyphs even when they cannot open it.</p><button type="button" disabled={busy || session.status !== 'active' || node.mechanism.forcePending} onClick={() => void command({ type: 'force_attempt', nodeId: node.id })}>{node.mechanism.forcePending ? 'Awaiting GM ruling in Foundry' : 'Attempt forced entry'}</button><small>{node.mechanism.forceAttempts} forced-entry attempts recorded.</small></div>}
  </section>;
}
