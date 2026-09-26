import { useEffect, useState } from 'react';
import { useAuth } from '../../context/useAuth';
import { consoles, type ConsoleId } from './catalog';
import './arcade.css';

function ConsoleShape({ id }: { id: ConsoleId }) {
  return <span className={`ra-console-shape ra-${id}`} aria-hidden="true"><i /><b>+</b><em>••</em></span>;
}

function GameArt({ art, consoleId }: { art: string; consoleId: ConsoleId }) {
  const polygon = consoleId === 'x64';
  return <svg className={`ra-art ra-art-${art}`} viewBox="0 0 240 180" aria-hidden="true" shapeRendering={polygon ? 'geometricPrecision' : 'crispEdges'}>
    <path className="ra-stars" d="M24 26h3v3h-3zM188 20h3v3h-3zM213 64h3v3h-3zM65 49h3v3h-3zM153 37h3v3h-3z" />
    {art === 'moon' ? <>
      <path className="ra-art-mid" d={polygon ? 'M144 26L177 39 187 71 164 98 128 91 113 58Z' : 'M136 28h32v8h16v16h8v32h-8v16h-16v8h-32v-8h-16V84h-8V52h8V36h16z'} />
      <path className="ra-art-light" d={polygon ? 'M144 26L153 63 128 91 113 58Z' : 'M136 28h24v8h-24v16h-8v32h8v16h-16V84h-8V52h8V36h16z'} />
      <path className="ra-ground" d="M0 146h32v-9h40v9h40v-18h48v8h48v-10h32v54H0z" />
      <path className="ra-art-light" d="M51 109h16v8h8v20H43v-20h8zM47 137h8v10h-8zM63 137h8v10h-8z" /><path className="ra-art-dark" d="M51 118h16v9H51z" />
    </> : art === 'forest' ? <>
      <path className="ra-art-mid" d={polygon ? 'M8 135L48 33 87 135ZM80 143L130 17 179 143ZM148 135L195 46 242 135Z' : 'M32 46h24v16h12v16h12v20h12v38H4V98h12V78h16zM116 25h24v20h12v20h12v24h12v51H80V89h12V65h12V45h12zM188 56h24v20h12v24h12v40h-64v-40h16z'} />
      <path className="ra-art-light" d={polygon ? 'M48 33L48 135H8ZM130 17L130 143H80ZM195 46L195 135H148Z' : 'M32 62h12v36H16V78h16zM116 45h12v44H92V65h12V45zM188 76h12v24h-12z'} />
      <path className="ra-ground" d="M0 148h240v32H0z" /><path className="ra-art-light" d="M116 146h16v10h16v10h24v14H84v-14h16v-10h16z" />
    </> : <>
      <path className="ra-art-mid" d={polygon ? 'M40 82L76 62 112 82 112 124 76 145 40 124ZM127 48L162 28 197 48 197 91 162 111 127 91Z' : 'M36 76h36V40h36v108H36zM132 40h72v36h-36v36h-36zM132 124h72v36h-72z'} />
      <path className="ra-art-light" d={polygon ? 'M40 82L76 62 112 82 76 103ZM127 48L162 28 197 48 162 69Z' : 'M40 80h28v8H40zM76 44h28v8H76zM76 80h28v8H76zM136 44h28v8h-28zM172 44h28v8h-28zM136 128h28v8h-28zM172 128h28v8h-28z'} />
      {polygon && <path className="ra-art-dark" d="M76 103L112 82V124L76 145ZM162 69L197 48V91L162 111Z" />}
    </>}
  </svg>;
}

export default function ArcadePage() {
  const { user, isAuthenticated, login, logout, error } = useAuth();
  const [consoleId, setConsoleId] = useState<ConsoleId>('x8');
  const [selectedGame, setSelectedGame] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const system = consoles.find(item => item.id === consoleId) ?? consoles[0];
  const game = system.games[selectedGame];
  useEffect(() => { const previous = document.title; document.title = 'Retro Arcade | SCON'; return () => { document.title = previous; }; }, []);
  async function authenticate() {
    setBusy(true); setActionError('');
    try { if (isAuthenticated) await logout(); else await login('/arcade'); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Connection failed. Please try again.'); }
    finally { setBusy(false); }
  }
  return <div className="retro-arcade" data-console={consoleId}>
    <div className="ra-shell">
      <header className="ra-header"><a href="/arcade" className="ra-brand"><span className="ra-brand-icon" aria-hidden="true">✚</span><span>RETRO<span className="ra-brand-secondary">ARCADE</span></span></a><span className="ra-header-note">SMALL GAMES. GOOD TIMES.</span><span className="ra-build">VOL. 001 <i /> {isAuthenticated ? 'CONNECTED' : 'STANDBY'}</span></header>
      {isAuthenticated ? <>
        <div className="ra-session"><span><i className="ra-status-dot" /> PLAYER 01 <strong>{user?.username || 'Player'}</strong></span><button disabled={busy} onClick={() => void authenticate()}>{busy ? 'DISCONNECTING…' : 'SIGN OUT ↗'}</button></div>
        <div className="ra-workspace">
          <aside className="ra-sidebar"><p className="ra-eyebrow">01 / SELECT CONSOLE</p><nav aria-label="Consoles">{consoles.map(item => <button key={item.id} aria-pressed={consoleId === item.id} onClick={() => { setConsoleId(item.id); setSelectedGame(0); }} className={consoleId === item.id ? 'ra-active' : ''}><ConsoleShape id={item.id} /><span><strong>{item.name}</strong><small>{item.bits}-BIT SYSTEM</small></span><span className="ra-selection-arrow" aria-hidden="true">{consoleId === item.id ? '◀' : '+'}</span></button>)}</nav><div className="ra-sidebar-bottom"><span>3 SYSTEMS<br />9 FUTURE ADVENTURES</span><p>A little collection.<br />A lot to look forward to.</p><span className="ra-pixel-line">▪ ▪ ▪ ▪ ▪</span></div></aside>
          <section className="ra-library" aria-label={`${system.name} game library`}>
            <div className="ra-library-heading"><div><p className="ra-eyebrow">02 / GAME LIBRARY</p><h1>{system.name}<span>{system.bits}-BIT</span></h1><p>{system.description}</p></div><div className="ra-system-stamp"><span>{system.label}</span><small>{system.detail}</small></div></div>
            <div className="ra-game-grid">{system.games.map((item, index) => <button key={item.name} className={`ra-game ${selectedGame === index ? 'ra-selected' : ''}`} aria-pressed={selectedGame === index} onClick={() => setSelectedGame(index)}><div className="ra-game-art"><span className="ra-cartridge-number">{system.name} / 00{index + 1}</span><GameArt art={item.art} consoleId={consoleId} /><span className="ra-art-caption">{item.genre.toUpperCase()}</span></div><div className="ra-game-title"><small>CARTRIDGE 0{index + 1}</small><h2>{item.name}</h2><span>COMING SOON <span aria-hidden="true">↗</span></span></div></button>)}</div>
            <div className="ra-game-detail" aria-live="polite"><div><p className="ra-eyebrow">IN DEVELOPMENT / PLACEHOLDER</p><h2>{game.name}</h2><p>{game.description}</p></div><button disabled>COMING SOON <span aria-hidden="true">◇</span></button></div>
            <p className="ra-library-note"><span aria-hidden="true">＋</span> The shelves are ready. The adventures are on their way.</p>
          </section>
        </div>
      </> : <section className="ra-welcome">
        <div className="ra-welcome-copy"><p className="ra-eyebrow"><i className="ra-status-dot" /> A NEW PLACE TO PRESS START</p><h1>Less pixels.<br />More <span>play.</span></h1><p>Three generations. One little arcade.<br />Pick your console. Find your next adventure.</p><button className="ra-start" disabled={busy} onClick={() => void authenticate()}><span aria-hidden="true">▶</span> {busy ? 'CONNECTING…' : 'CONTINUE WITH DISCORD'} <span aria-hidden="true">↗</span></button><small>YOUR DISCORD ACCOUNT IS YOUR PLAYER PASS.</small></div>
        <div className="ra-welcome-machine" aria-hidden="true"><div className="ra-machine-top">SCON / POCKET SYSTEM <span>●</span></div><div className="ra-machine-screen"><span>RETRO ARCADE</span><GameArt art="moon" consoleId="x8" /><strong>PRESS START</strong><small>3 CONSOLES · ENDLESS POSSIBILITY</small></div><div className="ra-machine-controls"><b>✚</b><span><i /> <i /></span></div><div className="ra-machine-bottom">X8 <span>▰ ▰ ▰</span></div></div>
        <div className="ra-era-strip">{consoles.map(item => <div key={item.id}><ConsoleShape id={item.id} /><span><strong>{item.name}</strong><small>{item.label}</small></span><span className="ra-era-bits">{item.bits}-BIT</span></div>)}</div>
      </section>}
      {(actionError || error) && <p className="ra-error" role="alert">{actionError || error}</p>}
      <footer className="ra-footer"><span>SCON RETRO ARCADE <span className="ra-footer-dim">/ EST. 2026</span></span><span>NO COINS REQUIRED. <span aria-hidden="true">✦</span></span></footer>
    </div>
  </div>;
}
