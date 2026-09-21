import { useMemo, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import { CHECKS } from './model';
import { BackLink, type PageProps } from './PlayerPages';

const categories = {
  aid: ['Helping hands', 'Most completed aid checks, whether successful or not.'],
  main: ['At the heart of it', 'Most completed main contributions.'],
  specialist: ['Leading performer', 'Most completed checks using your selected skill.'],
  highest: ['Highest roller', 'Highest single check total, including the declared modifier.'],
  lowest: ['Lowest roller', 'Lowest single check total, including the declared modifier.'],
  diverse: ['Many talents', 'Most distinct skills used in completed contributions.'],
  success: ['Most successful', 'Most finalized successes across aid and main checks.'],
  failure: ['Bad omen', 'Most finalized failures. Even the unlucky leave a story.'],
  fame: ['Local Fame', 'Regional reputation earned through events. Payouts are not configured yet.'],
} as const;
type Category = keyof typeof categories;
export function LeaderboardsPage({ snapshot }: PageProps) {
  const [category, setCategory] = useState<Category>('aid');
  const [skill, setSkill] = useState('Performance');
  const [region, setRegion] = useState('');
  const [period, setPeriod] = useState('all');
  const [group, setGroup] = useState('character');
  const skillBased = ['specialist', 'highest', 'lowest'].includes(category);
  const ranked = useMemo(() => {
    if (category === 'fame') return [];
    const cutoff = period === 'all' ? 0 : Date.now() - Number(period) * 86400000;
    const eligible = snapshot.contributions.filter(c => c.status === 'completed' && new Date(c.endsAt).getTime() >= cutoff && (!region || snapshot.events.find(e => e.id === c.eventId)?.definition.region === region) && (!skillBased || c.skill === skill));
    const groups = new Map<string, { id: string; name: string; value: number; skills: Set<string>; breakdown: string }>();
    for (const c of eligible) {
      if ((category === 'aid' && c.kind !== 'aid') || (category === 'main' && c.kind !== 'main') || (category === 'success' && !c.success) || (category === 'failure' && c.success)) continue;
      const id = group === 'player' ? c.playerId : c.characterId;
      const row = groups.get(id) ?? { id, name: group === 'player' ? c.playerName ?? `Player ${c.playerId.slice(0, 6)}` : c.characterName, value: category === 'highest' ? -Infinity : category === 'lowest' ? Infinity : 0, skills: new Set<string>(), breakdown: '' };
      row.skills.add(c.skill);
      if (category === 'highest' || category === 'lowest') {
        if (category === 'highest' ? c.total > row.value : c.total < row.value) { row.value = c.total; row.breakdown = `d20 ${c.die} ${c.modifier >= 0 ? '+' : '−'} ${Math.abs(c.modifier)} · ${c.skill}`; }
      } else row.value = category === 'diverse' ? row.skills.size : row.value + 1;
      groups.set(id, row);
    }
    return [...groups.values()].sort((a, b) => (category === 'lowest' ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }, [snapshot, category, skill, region, period, group, skillBased]);
  return <><BackLink /><header className="wm-page-heading"><p className="wm-kicker">THE PEOPLE WHO SHOWED UP</p><h1>Local acts. <em>Lasting fame.</em></h1><p className="wm-lede">For the helpers, the specialists, and the wonderfully unlucky. Every completed contribution has a place in the chronicle.</p></header>
    <section className="wm-panel"><div className="wm-form-grid"><label className="wm-field">Recognition<select value={category} onChange={e => setCategory(e.target.value as Category)}>{Object.entries(categories).map(([key, [title]]) => <option value={key} key={key}>{title}</option>)}</select></label><label className="wm-field">Region<select value={region} onChange={e => setRegion(e.target.value)}><option value="">All regions</option>{[...new Set(snapshot.events.map(e => e.definition.region))].sort().map(r => <option key={r}>{r}</option>)}</select></label><label className="wm-field">Rank<select value={group} onChange={e => setGroup(e.target.value)}><option value="character">Characters</option><option value="player">Players · all their characters</option></select></label><label className="wm-field">Time period<select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option></select></label>{skillBased && <label className="wm-field">Skill or check<select value={skill} onChange={e => setSkill(e.target.value)}>{CHECKS.map(s => <option key={s}>{s}</option>)}</select></label>}</div></section>
    <section className="wm-panel wm-board-section"><div className="wm-section-heading"><div><p className="wm-kicker">{region || 'ACROSS THE WESTMARCH'}</p><h2><Trophy size={25} /> {categories[category][0]}</h2><p className="wm-muted">{categories[category][1]}</p></div><Medal className="wm-medal" size={48} strokeWidth={1} /></div>{ranked.length ? <div className="wm-table-wrap"><table className="wm-table"><thead><tr><th scope="col">Rank</th><th scope="col">{group === 'player' ? 'Player' : 'Character'}</th><th scope="col">{['highest', 'lowest'].includes(category) ? 'Roll total' : category === 'diverse' ? 'Distinct skills' : 'Contributions'}</th></tr></thead><tbody>{ranked.map((row, i) => { const rank = ranked.findIndex(r => r.value === row.value) + 1; return <tr key={row.id}><td><span className={`wm-rank ${rank <= 3 ? 'top' : ''}`}>{rank === 1 ? <Medal size={20} /> : String(rank).padStart(2, '0')}</span></td><td><strong>{row.name}</strong>{row.breakdown && <small>{row.breakdown}</small>}</td><td><strong className="wm-ranking-number">{row.value}</strong>{i > 0 && ranked[i - 1].value === row.value && <span className="wm-fine"> tied</span>}</td></tr>; })}</tbody></table></div> : <div className="wm-empty"><Trophy size={35} strokeWidth={1} /><h3>{category === 'fame' ? 'Reputation rewards are being prepared.' : 'The next name could be yours.'}</h3><p>{category === 'fame' ? 'Staff have not configured reputation payouts. Contribution rankings already recognize completed work.' : 'No completed contributions match these filters yet. Pending rolls join the rankings when their scheduled work finishes.'}</p></div>}<p className="wm-fine">Completed, non-void contributions only. Tied scores share a rank. Modifiers are declared by players; a high total is not a verified character-sheet bonus.</p></section>
  </>;
}
