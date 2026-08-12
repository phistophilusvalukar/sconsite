import React from 'react';
import { ArrowUpRight, Github, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';

const Footer: React.FC = () => {
  return (
    <footer className="site-footer">
      <div className="site-footer-rule"><span /></div>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <span className="site-footer-mark"><Shield /></span>
          <div><p className="site-kicker">The Shattered Convergence</p><h2>Pathfinder Westmarch</h2></div>
          <p>A living campaign registry for characters, guilds, expeditions, and the stories that return from them.</p>
        </div>

        <div className="site-footer-links">
          <div>
            <h3>Registry</h3>
            <Link to="/characters">Characters</Link>
            <Link to="/guilds">Guilds</Link>
            <Link to="/citizens">Citizens</Link>
          </div>
          <div>
            <h3>At the table</h3>
            <Link to="/games">Adventures</Link>
            <Link to="/schedule">Schedule</Link>
            <Link to="/news">Dispatches</Link>
          </div>
          <div>
            <h3>Elsewhere</h3>
            <Link to="/about">About the campaign</Link>
            <a href="https://github.com/pathfinder-westmarch">GitHub <Github /></a>
            <Link to="/profile">Your profile <ArrowUpRight /></Link>
          </div>
        </div>
      </div>
      <div className="site-footer-bottom">
        <p>© {new Date().getFullYear()} Pathfinder Westmarch. Kept for the community.</p>
        <span>Persistent world · Player-led stories · Pathfinder 2e</span>
      </div>
    </footer>
  );
};

export default Footer;
