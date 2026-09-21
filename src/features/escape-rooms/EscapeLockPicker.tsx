import { useEffect, useRef, useState } from 'react';
import LockMechanism from '../lockpicking/LockMechanism';
import type { PublicNode } from './model';
import type { RoomCommand } from './service';

export default function EscapeLockPicker({ node, active, command }: { node: PublicNode; active: boolean; command: RoomCommand }) {
  const [angle, setAngle] = useState(node.mechanism.angle);
  const [holding, setHolding] = useState(false);
  const [pending, setPending] = useState(false);
  const held = useRef(false);
  const inFlight = useRef(false);
  const latest = useRef({ node, active, command, angle });
  latest.current = { node, active, command, angle };
  const mechanismRef = useRef<HTMLDivElement>(null);
  const blocked = !active || node.mechanism.jammed || node.mechanism.picked || (node.mechanism.occupied && !node.mechanism.canControl);
  const stop = () => { held.current = false; setHolding(false); };
  const start = async () => {
    if (inFlight.current || blocked || held.current) return;
    held.current = true; inFlight.current = true; setPending(true);
    const ok = await command({ type: 'start_pick', nodeId: node.id });
    inFlight.current = false; setPending(false);
    if (held.current && ok) setHolding(true); else held.current = false;
  };
  useEffect(() => {
    const release = () => { held.current = false; setHolding(false); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', release);
    return () => { held.current = false; window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', release); };
  }, []);
  useEffect(() => {
    if (!holding) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const current = latest.current;
      if (stopped || !held.current) return;
      if (!current.active || !current.node.mechanism.canControl || current.node.mechanism.jammed || current.node.mechanism.picked) { stop(); return; }
      inFlight.current = true;
      const ok = await current.command({ type: 'pick_turn', nodeId: current.node.id, angle: current.angle });
      inFlight.current = false;
      if (!ok) { stop(); return; }
      if (!stopped) timer = setTimeout(() => { void tick(); }, 250);
    };
    timer = setTimeout(() => { void tick(); }, 250);
    return () => { stopped = true; clearTimeout(timer); };
  }, [holding]);
  return <section className="er-picking" aria-label="Lockpicking minigame">
    <h3>Pick the embedded lock</h3><p>Find the angle, then hold tension. Release when it binds and adjust your pick. Each broken pick counts as a failed attempt; the third jams the mechanism for everyone.</p>
    <LockMechanism angle={angle} rotation={holding ? node.mechanism.rotation : 0} elementRef={mechanismRef} interactive={!blocked}
      onPointerMove={event => {
        if (holding || pending || blocked || !mechanismRef.current) return;
        const bounds = mechanismRef.current.getBoundingClientRect();
        setAngle(Math.max(-74, Math.min(74, Math.atan2(event.clientX - bounds.left - bounds.width / 2, bounds.top + bounds.height / 2 - event.clientY) * 180 / Math.PI)));
      }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); void start(); }} onPointerUp={stop} onPointerCancel={stop} />
    <label>Pick angle: {Math.round(angle)}°<input type="range" min={-74} max={74} step={1} value={angle} disabled={holding || pending || blocked} onChange={e => setAngle(Number(e.target.value))} /></label>
    <div className="er-actions"><button type="button" disabled={blocked} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); void start(); }} onPointerUp={stop} onPointerCancel={stop} onKeyDown={e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); void start(); } }} onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } }} onBlur={stop}>{pending ? 'Taking position…' : holding ? 'Applying tension… release to stop' : 'Hold to turn (or hold Space)'}</button><button type="button" disabled={holding || pending || !node.mechanism.canControl} onClick={() => void command({ type: 'release_pick', nodeId: node.id })}>Put tools down</button></div>
    <p role="status">Pick durability {Math.ceil(node.mechanism.health)}% · failures {node.mechanism.failures}/3 · turn {Math.round(node.mechanism.rotation / 92 * 100)}%</p>
    {node.mechanism.occupied && !node.mechanism.canControl && <p>Another player has the tools. Their turn expires after 15 seconds without activity.</p>}
  </section>;
}
