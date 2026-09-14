import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { loadAncientTerminalProgress } from './ancientTerminalService';
import type { PhaseTwoRoute } from './chapterOnePathways';
import './ancientTerminal.css';

const ROUTES: Record<PhaseTwoRoute, { code: string; title: string; status: string }> = {
  phase_2a: { code: '2A', title: 'SHUTDOWN RACE', status: 'WORLD HALT IN PROGRESS' },
  phase_2b: { code: '2B', title: 'HEART OF THE HORROR', status: 'CONTAINMENT TRANSFER COMPLETE' },
  phase_2c: { code: '2C', title: 'UNSTABLE WORLD', status: 'REALITY CHECKSUM FAILING' },
};

function isPhaseTwoRoute(value: string | undefined): value is PhaseTwoRoute {
  return value === 'phase_2a' || value === 'phase_2b' || value === 'phase_2c';
}

export default function AncientTerminalPhaseGateway() {
  const { route } = useParams();
  const { user } = useAuth();
  const [access, setAccess] = useState<'loading' | 'allowed' | 'denied'>('loading');

  useEffect(() => {
    if (!user || !isPhaseTwoRoute(route)) {
      setAccess('denied');
      return;
    }
    let current = true;
    void loadAncientTerminalProgress()
      .then(progress => current && setAccess(progress.phaseTwoRoute === route ? 'allowed' : 'denied'))
      .catch(() => current && setAccess('denied'));
    return () => { current = false; };
  }, [route, user]);

  if (!isPhaseTwoRoute(route)) return <Navigate to="/ancient-terminal" replace />;
  const destination = ROUTES[route];

  return <main className={`ancient-terminal phase-gateway phase-gateway-${destination.code.toLowerCase()}`}>
    <section className="phase-gateway-panel" aria-live="polite">
      {access === 'loading' && <>
        <p>VERIFYING TRANSFER RECORD...</p>
        <p className="voice-muted">DO NOT BREAK CONNECTION</p>
      </>}
      {access === 'denied' && <>
        <p>ENTRY HANDLE REJECTED</p>
        <p className="voice-muted">No matching transfer record exists for this operator.</p>
        <Link to="/ancient-terminal">RETURN TO TERMINAL</Link>
      </>}
      {access === 'allowed' && <>
        <p>ANCIENT TRANSFER // ROUTE {destination.code}</p>
        <h1>{destination.title}</h1>
        <p>{destination.status}</p>
        <p className="voice-muted">Phase destination reserved. Runtime module not installed.</p>
      </>}
    </section>
  </main>;
}
