import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { ArrowRight, Compass, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import type { Command, Snapshot } from './model';
import { loadWestmarch, sendWestmarchCommand } from './service';
import { CharactersPage, EventBoard, EventDetail } from './PlayerPages';
import { SchedulePage } from './SchedulePage';
import { LeaderboardsPage } from './LeaderboardsPage';
import { EventControlsPage, EventLogPage, StaffAdminPage, StaffApplicationPage, SubmissionPage } from './StaffPages';
import './westmarch.css';

const CharacterProfile = lazy(() => import('../../pages/CharacterProfilePage'));
const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function OwnedCharacterProfile({ snapshot }: { snapshot: Snapshot }) {
  const { characterId } = useParams();
  return <><Link className="wm-back" to="/westmarch/characters">← Your characters</Link>{snapshot.characters.some(c => c.id === characterId)
    ? <CharacterProfile />
    : <section className="wm-empty"><h1>Character unavailable</h1><p>This page is for your own characters. Public character sharing follows the registry’s privacy settings.</p></section>}</>;
}

export default function WestmarchPage() {
  const { isAuthenticated, isLoading, login, user } = useAuth();
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef(0);
  const locked = useRef(false);
  const account = useRef(user?.id);
  account.current = user?.id;
  const pending = useRef<{ signature: string; id: string } | null>(null);
  const invalidate = useCallback(() => { operation.current++; }, []);
  const refresh = useCallback(async (quiet = false) => {
    if (!isAuthenticated || locked.current) return;
    const revision = ++operation.current;
    if (!quiet) { setLoading(true); setError(''); }
    try { const next = await loadWestmarch(); if (revision === operation.current) { setSnapshot(next); setError(''); } }
    catch (err) { if (revision === operation.current) setError(message(err)); }
    finally { if (revision === operation.current) setLoading(false); }
  }, [isAuthenticated]);
  useEffect(() => {
    setSnapshot(null); pending.current = null; setNotice('');
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(true); }, 60000);
    return () => { window.clearInterval(timer); invalidate(); };
  }, [refresh, user?.id, invalidate]);
  useEffect(() => { window.scrollTo({ top: 0 }); setNotice(''); }, [location.pathname]);

  async function execute(command: Command): Promise<boolean> {
    if (locked.current || !isAuthenticated) return false;
    const currentAccount = account.current;
    locked.current = true; ++operation.current; setLoading(false); setBusy(true); setError(''); setNotice('');
    const signature = JSON.stringify(command);
    const key = `westmarch-request:${currentAccount}`;
    try {
      // Retain request identity across a lost response or refresh; never reroll a retry.
      if (!pending.current) {
        try { const saved: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (saved && typeof saved === 'object' && 'signature' in saved && 'id' in saved && typeof saved.signature === 'string' && typeof saved.id === 'string') pending.current = { signature: saved.signature, id: saved.id }; } catch { /* Storage can be unavailable; the current session still retains the request. */ }
      }
      if (pending.current?.signature !== signature) pending.current = { signature, id: crypto.randomUUID() };
      try { sessionStorage.setItem(key, JSON.stringify(pending.current)); } catch { /* In-memory retry remains available. */ }
      const next = await sendWestmarchCommand(command, pending.current.id);
      if (account.current !== currentAccount) return false;
      setSnapshot(next); pending.current = null;
      try { sessionStorage.removeItem(key); } catch { /* No sensitive credentials are stored here. */ }
      setNotice(command.type === 'book' ? 'Your plan is committed. Your recorded rolls are in the contribution history below.' : 'Your changes have been saved.');
      return true;
    } catch (err) { if (account.current === currentAccount) setError(message(err)); return false; }
    finally { locked.current = false; setBusy(false); }
  }

  const props = snapshot ? { snapshot, execute, busy } : null;
  return <div className="wm-app"><div className="wm-page">
    <div className="wm-masthead"><span className="wm-wordmark"><Compass size={23} strokeWidth={1.3} /> SHATTERED CONVERGENCE <span>/ WESTMARCH</span></span><span className="wm-account"><ShieldCheck size={14} />{isAuthenticated ? user?.username : 'One community. One account.'}</span></div>
    {isLoading ? <div className="wm-empty" role="status"><Loader2 className="wm-spin" /> Opening the chronicle…</div> : !isAuthenticated ? <section className="wm-login"><p className="wm-kicker">YOUR NEXT CHAPTER STARTS HERE</p><h1>Small acts.<br /><em>Lasting legends.</em></h1><p className="wm-lede">Bring a character. Make time to help. Shape the stories of the Westmarch together.</p><button className="wm-button" onClick={() => { setError(''); void login(`${location.pathname}${location.search}`).catch(err => setError(message(err))); }}>Continue with Discord <ArrowRight size={18} /></button><p className="wm-fine">Use your existing Shattered Convergence account. Your characters and history stay with you.</p></section> : <>
      <div className="wm-sync"><span>{busy ? 'Saving your changes…' : loading ? 'Refreshing…' : 'Updates refresh every minute'}</span><button className="wm-text-link" disabled={busy || loading} onClick={() => void refresh()}><RefreshCw size={13} className={loading ? 'wm-spin' : ''} />Refresh</button></div>
      {notice && <div className="wm-notice" role="status">{notice}</div>}
      {!snapshot && !error && <div className="wm-empty" role="status"><Loader2 className="wm-spin" /> Gathering the latest stories…</div>}
      {props && <Suspense fallback={<div className="wm-empty" role="status">Opening character page…</div>}><Routes>
        <Route index element={<EventBoard {...props} />} />
        <Route path="events/:eventId" element={<EventDetail {...props} />} />
        <Route path="characters" element={<CharactersPage {...props} />} />
        <Route path="characters/:characterId" element={<OwnedCharacterProfile snapshot={props.snapshot} />} />
        <Route path="schedule" element={<SchedulePage {...props} />} />
        <Route path="leaderboards" element={<LeaderboardsPage {...props} />} />
        <Route path="submissions" element={<SubmissionPage {...props} />} />
        <Route path="staff/apply" element={<StaffApplicationPage {...props} />} />
        <Route path="controls" element={<EventControlsPage {...props} />} />
        <Route path="admin" element={<StaffAdminPage {...props} />} />
        <Route path="log" element={<EventLogPage {...props} />} />
        <Route path="*" element={<section className="wm-empty"><h1>This page hasn’t been written.</h1><Link className="wm-button" to="/westmarch">Return to the event board</Link></section>} />
      </Routes></Suspense>}
    </>}
    {error && <div className="wm-error wm-service-error" role="alert"><strong>We couldn’t finish that request.</strong><p>{error}</p><p className="wm-fine">If a roll request lost its response, resubmit the same plan to recover its original result. Refresh to check your saved history first.</p></div>}
    <footer className="wm-footer"><Compass size={16} /><span>THE WESTMARCH CHRONICLE</span><p>Many characters. One changing world.</p></footer>
  </div></div>;
}
