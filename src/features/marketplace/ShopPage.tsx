import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { ArrowLeft, BadgePercent, Check, Clock3, Hammer, Palette, ScrollText, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { BonusPanel, CommissionForm, ShopEditor } from './MarketplacePage';
import { listShopCommissionLog, listShops, updateCommissionStatus } from './marketplaceRepository';
import { commissionWorkflow, type CommissionStatus, type PlayerShop, type ShopCommission } from './types';
import './marketplace.css';
import './marketplaceQueue.css';
import './shopPage.css';

const statusLabel = (status: CommissionStatus) => status.replaceAll('_', ' ');

export default function ShopPage() {
  const { shopId } = useParams();
  const { user } = useAuth();
  const [shop, setShop] = useState<PlayerShop | null>(null);
  const [commissions, setCommissions] = useState<ShopCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [commissioning, setCommissioning] = useState(false);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    if (!shopId) return;
    setError('');
    try {
      const shops = await listShops();
      const selected = shops.find(item => item.id === shopId) ?? null;
      setShop(selected);
      if (selected) setCommissions(await listShopCommissionLog(selected.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The shop could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (loading) return <main className="shop-page-state"><Clock3 /> Opening the shop ledger…</main>;
  if (!shop) return <main className="shop-page-state"><h1>Shop not found</h1><p>{error || 'This shop is no longer listed.'}</p><Link to="/marketplace">Return to the marketplace</Link></main>;

  const isOwner = shop.ownerId === user?.id;
  const pageStyle = {
    '--shop-accent': shop.pageAccentColor,
    backgroundImage: shop.pageBackgroundImageUrl
      ? `linear-gradient(rgb(8 12 11 / .88), rgb(8 12 11 / .96)), url(${JSON.stringify(shop.pageBackgroundImageUrl)})`
      : undefined
  } as CSSProperties;

  return <main className="shop-page" data-theme={shop.pageTheme} style={pageStyle}>
    <nav className="shop-page-nav"><Link to="/marketplace"><ArrowLeft /> Marketplace</Link><div>{isOwner && <button onClick={() => setEditing(true)}><Palette /> Customize shop</button>}</div></nav>

    <header className="shop-page-hero" style={shop.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgb(7 10 9 / .94), rgb(7 10 9 / .35)), url(${JSON.stringify(shop.imageUrl)})` } : undefined}>
      <div><p className="shop-page-kicker">{shop.kind === 'crafting' ? <Hammer /> : <Sparkles />} {shop.kind} shop · Tier {shop.tier}</p><h1>{shop.title}</h1>{shop.pageTagline && <p className="shop-page-tagline">{shop.pageTagline}</p>}<p>Operated by <b>{shop.characterName}</b> · {shop.ownerName}</p><div className="shop-tags">{shop.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div>
      {shop.characterAvatar && <img src={shop.characterAvatar} alt={`${shop.characterName} portrait`} />}
    </header>

    <div className="shop-page-layout">
      <article className="shop-page-ledger">
        <section><p className="shop-page-section-label">The establishment</p><h2>About the shop</h2><p className="shop-description">{shop.description}</p><div className="shop-page-summary"><div><BadgePercent /><b>{shop.overallDiscountPercent}%</b><span>overall discount</span></div><div><Check /><b>Tier {shop.tier}</b><span>maximum offering</span></div></div></section>
        {shop.feats.length > 0 && <section><p className="shop-page-section-label">Terms of trade</p><h2>Discount feats</h2><div className="listing-table">{shop.feats.map((feat, index) => <div key={`${feat.name}-${index}`}><b>{feat.name}</b><span>{feat.appliesTo}</span><strong>-{feat.discountPercent}%</strong></div>)}</div></section>}
        {shop.kind === 'crafting' ? <section><p className="shop-page-section-label">Workshop capability</p><h2>{shop.specialty || 'Crafting'} check</h2><BonusPanel label="Crafting modifier" bonus={shop.craftingBonus} assurance={shop.craftingAssurance} degreeBoost={shop.craftingDegreeBoost} /></section> : <>
          <section><p className="shop-page-section-label">Ritual capability</p><h2>Disclosed skills</h2><div className="bonus-grid">{shop.ritualSkills.map(skill => <BonusPanel key={skill.skill} label={skill.skill} bonus={skill.bonus} assurance={skill.assurance} degreeBoost={skill.degreeBoost} />)}</div></section>
          <section><p className="shop-page-section-label">The catalogue</p><h2>Available rituals</h2><div className="listing-table">{shop.rituals.map((ritual, index) => <div key={`${ritual.name}-${index}`}><a href={ritual.aonUrl} target="_blank" rel="noreferrer"><b>{ritual.name}</b></a><span>Tier {ritual.tier} · {ritual.bypassesSecondaries ? 'No secondary checks required' : `Secondaries: ${ritual.secondarySkills.join(', ')}`}</span></div>)}</div></section>
          {shop.contributors.length > 0 && <section><p className="shop-page-section-label">Additional hands</p><h2>Contributors</h2><div className="listing-table">{shop.contributors.map((person, index) => <div key={`${person.name}-${index}`}><b>{person.name}</b><span>{person.skills.join(', ')}</span><strong>+{person.bonus}</strong></div>)}</div></section>}
        </>}
        {shop.acceptsCommissions && <section className="shop-page-request">
          {!commissioning && <div className="shop-page-request-cta"><div><p className="shop-page-section-label">Place an order</p><h2>Commission this shop</h2><p>Send the shopkeeper your requirements, budget, and desired deadline.</p></div><button className="marketplace-primary" onClick={() => setCommissioning(true)}>Request a commission</button></div>}
          {commissioning && <CommissionForm shop={shop} onClose={() => setCommissioning(false)} onSubmitted={() => void refresh()} />}
        </section>}
      </article>

      <aside className="shop-commission-log">
        <header><ScrollText /><div><p className="shop-page-section-label">Shared record</p><h2>Commission log</h2></div></header>
        <p className="shop-log-explainer">Requests and every status change appear here for the shop owner and the requesting customer.</p>
        {error && <p className="marketplace-error">{error}</p>}
        {commissions.length === 0 ? <p className="shop-log-empty">No commissions involving you at this shop yet.</p> : commissions.map(commission => <CommissionLogCard key={commission.id} commission={commission} onChanged={refresh} />)}
      </aside>
    </div>

    {editing && <ShopEditor ownedShops={[shop]} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void refresh(); }} />}
  </main>;
}

function CommissionLogCard({ commission, onChanged }: { commission: ShopCommission; onChanged: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentStep = commissionWorkflow.indexOf(commission.status);

  const transition = async (status: CommissionStatus) => {
    setBusy(true); setError('');
    try { await updateCommissionStatus(commission.id, status, note); setNote(''); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The status could not be updated.'); }
    finally { setBusy(false); }
  };

  return <article className="shop-log-card">
    <header><div><small>{commission.requesterName}</small><h3><a href={commission.aonUrl} target="_blank" rel="noreferrer">{commission.itemName}</a></h3></div><span className={`queue-status ${commission.status}`}>{statusLabel(commission.status)}</span></header>
    <div className="shop-workflow" aria-label={`Commission status: ${statusLabel(commission.status)}`}>{commissionWorkflow.map((status, index) => <div key={status} className={index < currentStep ? 'is-complete' : index === currentStep ? 'is-current' : ''}><i /> <span>{statusLabel(status)}</span></div>)}</div>
    <p>{commission.details}</p><div className="queue-meta"><span>Tier {commission.itemTier}</span><span>Quantity {commission.quantity}</span>{commission.budget && <span>{commission.budget}</span>}{commission.deadline && <span>Due {new Date(`${commission.deadline}T00:00:00`).toLocaleDateString()}</span>}</div>
    {commission.events && commission.events.length > 0 && <ol className="shop-event-list">{[...commission.events].reverse().map(event => <li key={event.id}><i /><div><b>{statusLabel(event.toStatus)}</b><span>{event.actorName || (event.source === 'discord' ? 'Discord' : 'System')} · {new Date(event.createdAt).toLocaleString()}</span>{event.note && <p>{event.note}</p>}</div><em>{event.source}</em></li>)}</ol>}
    {['requested', 'in_progress', 'waiting_for_payment'].includes(commission.status) && <div className="shop-log-actions"><input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} placeholder="Optional update for the log" />{commission.perspective === 'owner' && commission.status === 'requested' && <><button disabled={busy} onClick={() => void transition('in_progress')}>Start work</button><button disabled={busy} onClick={() => void transition('declined')}>Decline</button></>}{commission.perspective === 'owner' && commission.status === 'in_progress' && <button disabled={busy} onClick={() => void transition('waiting_for_payment')}>Request payment</button>}{commission.perspective === 'owner' && commission.status === 'waiting_for_payment' && <button disabled={busy} onClick={() => void transition('in_progress')}>Return to work</button>}{commission.perspective === 'requester' && ['requested', 'in_progress'].includes(commission.status) && <button disabled={busy} onClick={() => void transition('cancelled')}>Cancel</button>}{commission.perspective === 'requester' && commission.status === 'waiting_for_payment' && <button className="is-primary" disabled={busy} onClick={() => void transition('completed')}>Confirm payment</button>}</div>}
    {error && <p className="marketplace-error">{error}</p>}
  </article>;
}
