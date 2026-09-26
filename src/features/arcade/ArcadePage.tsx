import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/useAuth';
import { consoles, type ConsoleId } from './catalog';
import './arcade.css';

function ConsoleGlyph({ id }: { id: ConsoleId }) {
  return <span className={`ra-console-glyph ra-console-glyph-${id}`} aria-hidden="true"><i /><b /></span>;
}

function Cartridge({ consoleId, title, number }: { consoleId: ConsoleId; title: string; number: number }) {
  return <span className={`ra-cartridge ra-cartridge-${consoleId}`} aria-hidden="true">
    <span className="ra-cart-ridge" />
    <span className="ra-cart-label"><small>{consoleId.toUpperCase()}-{String(number).padStart(2, '0')}</small><strong>{title}</strong><i>SCON SOFTWARE</i></span>
    <span className="ra-cart-contacts">||||||||||||</span>
  </span>;
}

function Prompt({ children }: { children: ReactNode }) {
  return <span className="ra-prompt"><span aria-hidden="true">C:\ARCADE&gt;</span>{children}<i aria-hidden="true" /></span>;
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
    <div className="ra-noise" aria-hidden="true" />
    <div className="ra-shell">
      <header className="ra-header"><a href="/arcade" className="ra-wordmark">SCON_OS <span>/ ARCADE</span></a><span className="ra-header-path">C:\SYSTEM\ARCADE\INDEX.EXE</span><span className="ra-clock">SYS.2026&nbsp;&nbsp;{isAuthenticated ? '[ONLINE]' : '[OFFLINE]'}</span></header>
      {isAuthenticated ? <main className="ra-main">
        <aside className="ra-sidebar">
          <div className="ra-sidebar-head"><span>SELECT_SYSTEM</span><small>03 DEVICES FOUND</small></div>
          <nav aria-label="Consoles">{consoles.map((item, index) => <button key={item.id} aria-pressed={consoleId === item.id} className={consoleId === item.id ? 'ra-active' : ''} onClick={() => { setConsoleId(item.id); setSelectedGame(0); }}><span className="ra-nav-index">0{index + 1}</span><ConsoleGlyph id={item.id} /><span className="ra-nav-copy"><strong>{item.name}</strong><small>{item.bits}-BIT PROTOTYPE</small></span><span className="ra-nav-cursor" aria-hidden="true">{consoleId === item.id ? '■' : '□'}</span></button>)}</nav>
          <div className="ra-sidebar-status"><span>USER</span><strong>{user?.username || 'PLAYER_01'}</strong><span>LIBRARY</span><strong>09 CARTRIDGES</strong><span>STATUS</span><strong>READY</strong></div>
          <button className="ra-signout" disabled={busy} onClick={() => void authenticate()}>{busy ? 'DISCONNECTING...' : '[ ESC ] SIGN OUT'}</button>
        </aside>
        <section className="ra-library" aria-label={`${system.name} game library`}>
          <div className="ra-library-head"><div><p>ACTIVE_SYSTEM / {system.name}</p><h1>{system.name}</h1><span>{system.description}</span></div><div className="ra-specs"><span>{system.bits}-BIT</span><small>{system.label}<br />{system.detail}</small></div></div>
          <div className="ra-game-grid">{system.games.map((item, index) => <button key={item.name} className={`ra-game ${selectedGame === index ? 'ra-selected' : ''}`} aria-pressed={selectedGame === index} onClick={() => setSelectedGame(index)}><span className="ra-game-number">{String(index + 1).padStart(2, '0')}</span><Cartridge consoleId={consoleId} title={item.name} number={index + 1} /><span className="ra-game-meta"><strong>{item.name}</strong><small>{item.genre.toUpperCase()} / PENDING</small></span><span className="ra-select-mark" aria-hidden="true">{selectedGame === index ? '[ SELECTED ]' : '[ LOAD ]'}</span></button>)}</div>
          <div className="ra-command-panel" aria-live="polite"><Prompt>inspect {game.name.toLowerCase().replaceAll(' ', '_')}</Prompt><div className="ra-command-output"><span>NAME</span><strong>{game.name}</strong><span>TYPE</span><strong>{game.genre.toUpperCase()}</strong><span>STATE</span><strong>IN DEVELOPMENT</strong><p>{game.description}</p><button disabled>[ EXECUTE UNAVAILABLE ]</button></div></div>
        </section>
      </main> : <main className="ra-login">
        <div className="ra-boot-copy"><p>SCON PERSONAL COMPUTER<br />RETRO ENTERTAINMENT SUBSYSTEM</p><h1>RETRO<br />ARCADE<span>_</span></h1><Prompt>login --provider discord</Prompt><button disabled={busy} onClick={() => void authenticate()}><span>{busy ? 'AUTHENTICATING...' : 'CONTINUE WITH DISCORD'}</span><b>ENTER ↵</b></button><small>AUTHENTICATION REQUIRED TO MOUNT GAME LIBRARY.</small></div>
        <div className="ra-boot-visual" aria-hidden="true"><div className="ra-boot-frame"><span className="ra-corner ra-corner-a">+</span><span className="ra-corner ra-corner-b">+</span><span className="ra-corner ra-corner-c">+</span><span className="ra-corner ra-corner-d">+</span><div className="ra-stack ra-stack-64"><Cartridge consoleId="x64" title="PRISM CIRCUIT" number={3} /></div><div className="ra-stack ra-stack-16"><Cartridge consoleId="x16" title="NEON COURIER" number={1} /></div><div className="ra-stack ra-stack-8"><Cartridge consoleId="x8" title="MOON MAIL" number={1} /></div><div className="ra-boot-label"><span>MEDIA_ARCHIVE</span><strong>3 FORMATS</strong><small>9 TITLES DETECTED</small></div></div></div>
        <div className="ra-boot-log" aria-hidden="true"><span>MEMORY CHECK ................ OK</span><span>VIDEO MODE ............. 1-BIT</span><span>INPUT DEVICE ........ KEYBOARD</span><span>NETWORK .............. STANDBY</span></div>
      </main>}
      {(actionError || error) && <p className="ra-error" role="alert">ERROR: {actionError || error}</p>}
      <footer className="ra-footer"><span>SCON_OS VERSION 0.01</span><span>© 2026 / NO COINS REQUIRED</span></footer>
    </div>
  </div>;
}
