import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Footprints,
  HandHeart,
  RotateCcw,
  Sparkles,
  Sun,
  Zap
} from 'lucide-react';

type TutorialTab = 'core' | 'rally' | 'stamina' | 'blocks';
type RallyHighlight = 'diver' | 'assist' | 'setter' | 'spiker' | 'recover';

interface ActionCardData {
  name: string;
  cost: string;
  range: string;
  summary: string;
  tone: string;
  icon: React.ReactNode;
}

const tabs: Array<{ id: TutorialTab; label: string }> = [
  { id: 'core', label: 'Core Rules' },
  { id: 'rally', label: 'Example Rally' },
  { id: 'stamina', label: 'Stamina' },
  { id: 'blocks', label: 'Blocking' }
];

const actionCards: ActionCardData[] = [
  {
    name: 'Dive',
    cost: 'Reaction',
    range: 'Move 10 ft | Place 10 ft',
    summary: 'Reach an incoming ball and redirect it. Spend 1 Stamina for each additional 5 feet of movement or placement.',
    tone: 'border-sky-200 bg-sky-50',
    icon: <Footprints className="h-5 w-5" />
  },
  {
    name: 'Set',
    cost: '1 Action',
    range: 'Place 20 ft',
    summary: 'Use Set while standing in the landing square. Its long base range makes it the team\'s premier positioning touch.',
    tone: 'border-violet-200 bg-violet-50',
    icon: <HandHeart className="h-5 w-5" />
  },
  {
    name: 'Spike',
    cost: '1 Action',
    range: 'Place 10 ft',
    summary: 'Send a fast attack across the net. Defenders cannot Stride after its landing square is declared.',
    tone: 'border-rose-200 bg-rose-50',
    icon: <Zap className="h-5 w-5" />
  }
];

const rallySteps: Array<{ title: string; body: string; highlight: RallyHighlight }> = [
  {
    title: '1. Dive',
    body: 'A defender uses their reaction to move up to 10 feet, receive the Spike, and place the ball within 10 feet.',
    highlight: 'diver'
  },
  {
    title: '2. Reposition and Assist',
    body: 'The diver still has all 3 actions. They Stride next to the Spiker, then spend 1 action to Assist, adding 10 feet to the Spiker\'s next touch.',
    highlight: 'assist'
  },
  {
    title: '3. Set',
    body: 'The Setter stands in the ball\'s landing square and spends 1 action to place the ball within 20 feet.',
    highlight: 'setter'
  },
  {
    title: '4. Spike',
    body: 'The Spiker stands in the Set\'s landing square and spends 1 action to attack a square within 10 feet, plus the 10-foot Assist bonus.',
    highlight: 'spiker'
  },
  {
    title: '5. Recover',
    body: 'Players use any remaining actions to Take a Breather. A player with all 3 actions available can instead Take a Rest.',
    highlight: 'recover'
  }
];

const quickReferenceRows = [
  ['Stride', '1 action', 'None', 'Move up to your Speed.'],
  ['Dive', 'Reaction', 'Incoming ball', 'Move 10 feet and place the ball 10 feet.'],
  ['Set', '1 action', 'Stand in landing square', 'Place the ball within 20 feet.'],
  ['Spike', '1 action', 'Stand in landing square', 'Fast attack within 10 feet.'],
  ['Assist', '1 action', 'Adjacent teammate', 'Add 10 feet to their next touch.'],
  ['Take a Breather', '1 action', 'None', 'Recover 1 Stamina.'],
  ['Take a Rest', '3 actions', 'None', 'Recover 4 Stamina.'],
  ['Normal Block', 'Reaction', 'Within 10 feet of Spiker', 'Return a Spike as a Pass.'],
  ['Power Block', 'Reaction + 3 Stamina', 'Within 10 feet of Passer', 'Return a Pass as a Spike.']
];

const teamRules = [
  'Four players per team.',
  'Each player receives 3 actions and 1 reaction.',
  'The team may touch the ball no more than 3 times.',
  'A player may touch the ball only once per possession.',
  'Players may act in any order.',
  'Normal actions and reactions cost no Stamina.'
];

const EventPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TutorialTab>('core');
  const [quickOpen, setQuickOpen] = useState(false);

  const activeContent = useMemo(() => {
    switch (activeTab) {
      case 'rally':
        return <RallyTutorial />;
      case 'stamina':
        return <StaminaRules />;
      case 'blocks':
        return <BlockRules />;
      default:
        return <CoreRules />;
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#082f38] text-cyan-950">
      <section className="bg-[linear-gradient(180deg,#0e7490_0%,#67e8f9_42%,#fef08a_42%,#fef3c7_100%)]">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-end pb-10">
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/50 bg-white/45 px-4 py-2 text-sm font-black uppercase tracking-[0.22em] text-cyan-950 shadow-lg">
              <Sun className="h-4 w-4" />
              <span>Current Event: Beach Episode</span>
            </div>
            <p className="text-sm font-black uppercase tracking-[0.28em] text-cyan-900">Pathfinder 2E Team Challenge</p>
            <h1 className="mt-3 max-w-4xl font-fantasy text-5xl font-black leading-none text-cyan-950 sm:text-7xl">
              Arcane Volley
            </h1>
            <p className="mt-5 max-w-3xl text-xl font-semibold leading-8 text-cyan-950/85">
              Learn the entire player ruleset through five fundamentals: Dive, Set, Spike, Assist, and Block. There are no rolls. Positioning and Stamina decisions determine every point.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              {['4 players', '3 touches', '3 actions', '1 reaction', '5 Stamina'].map(item => (
                <Pill key={item} label={item} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="sticky top-16 z-30 border-b border-cyan-950/15 bg-[#fff7d6]/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8" aria-label="Arcane Volley tutorial sections">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-black transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan-900 text-white shadow-md'
                  : 'bg-white/70 text-cyan-950 hover:bg-cyan-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-[#fff7d6]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 pb-24 sm:px-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:px-8 lg:pb-10">
          <main className="min-w-0 space-y-10">
            {activeContent}
            <PlayerQuickReference />
          </main>

          <div className="hidden lg:block">
            <QuickReferencePanel compact={false} sticky />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-cyan-950/20 bg-cyan-950 text-white shadow-2xl lg:hidden">
        <button type="button" onClick={() => setQuickOpen(open => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-black uppercase tracking-widest">
          <span>Quick Reference</span>
          <ChevronDown className={`h-5 w-5 transition-transform ${quickOpen ? 'rotate-180' : ''}`} />
        </button>
        {quickOpen && <QuickReferencePanel compact />}
      </div>
    </div>
  );
};

const Pill: React.FC<{ label: string }> = ({ label }) => (
  <span className="inline-flex items-center gap-2 rounded-full border border-cyan-950/15 bg-white/55 px-4 py-2 text-sm font-bold text-cyan-950 shadow-sm">
    <CircleDot className="h-4 w-4" />
    {label}
  </span>
);

const CardShell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`rounded-lg border border-cyan-900/15 bg-white p-5 shadow-xl shadow-cyan-950/10 ${className}`}>
    {children}
  </section>
);

const SectionHeading: React.FC<{ eyebrow: string; title: string; copy?: string }> = ({ eyebrow, title, copy }) => (
  <div className="mb-5">
    <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-700">{eyebrow}</p>
    <h2 className="mt-1 font-fantasy text-3xl font-black text-cyan-950">{title}</h2>
    {copy && <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-cyan-950/75">{copy}</p>}
  </div>
);

const ActionCard: React.FC<ActionCardData> = ({ name, cost, range, summary, tone, icon }) => (
  <article className={`rounded-lg border p-5 shadow-sm ${tone}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <span className="mb-3 inline-flex rounded bg-cyan-950 px-3 py-1 text-xs font-black uppercase tracking-widest text-white">
          {cost}
        </span>
        <div className="flex items-center gap-2 text-cyan-950">
          {icon}
          <h3 className="font-fantasy text-2xl font-black">{name}</h3>
        </div>
      </div>
      <span className="rounded-lg bg-white/75 px-3 py-2 text-sm font-black text-cyan-950 shadow-sm">{range}</span>
    </div>
    <p className="mt-4 text-sm font-semibold leading-6 text-cyan-950/75">{summary}</p>
  </article>
);

const CoreRules: React.FC = () => (
  <div className="space-y-8">
    <CardShell>
      <SectionHeading eyebrow="Core Rules" title="Dive, Set, Spike" copy="The subsystem is built from fast, readable actions. There are no checks or degrees of success in this version." />
      <div className="grid gap-4 md:grid-cols-3">
        {actionCards.map(card => <ActionCard key={card.name} {...card} />)}
      </div>
    </CardShell>

    <section className="grid gap-6 lg:grid-cols-2">
      <CardShell>
        <SectionHeading eyebrow="Team Rules" title="One possession at a glance" />
        <div className="grid gap-3 text-sm font-semibold text-cyan-950/80">
          {teamRules.map(rule => (
            <div key={rule} className="flex gap-3 rounded-lg bg-cyan-50 px-4 py-3">
              <span className="font-black text-amber-600">✓</span>
              <span>{rule}</span>
            </div>
          ))}
        </div>
      </CardShell>

      <CardShell>
        <SectionHeading eyebrow="Universal Stamina Boost" title="Push 5 feet farther" copy="Spend 1 Stamina to add 5 feet to an eligible movement or ball-placement range. Movement and placement are boosted separately." />
        <div className="grid grid-cols-4 gap-3 text-center">
          {[
            ['0', 'Base'],
            ['1', '+5 ft'],
            ['2', '+10 ft'],
            ['3', '+15 ft']
          ].map(([cost, result]) => (
            <div key={cost} className="rounded-lg bg-cyan-950 p-4 text-white">
              <div className="text-2xl font-black">{cost}</div>
              <div className="mt-1 text-xs font-black uppercase tracking-wide text-cyan-100">{result}</div>
            </div>
          ))}
        </div>
      </CardShell>
    </section>

    <CardShell>
      <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div>
          <SectionHeading eyebrow="Assist" title="Support an adjacent teammate" copy="Spend 1 action while adjacent to a teammate. Their next touch gains 10 feet of placement range. Only one Assist can apply to a touch." />
        </div>
        <div className="text-center font-fantasy text-5xl font-black text-fuchsia-700">+10 ft</div>
        <div className="rounded-lg bg-fuchsia-50 p-5 text-sm font-semibold leading-6 text-cyan-950/75">
          The assisting player may also spend Stamina, adding another 5 feet per point spent. The player touching the ball may spend their own Stamina as well.
        </div>
      </div>
    </CardShell>
  </div>
);

const RallyTutorial: React.FC = () => {
  const [step, setStep] = useState(0);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
      <CardShell>
        <SectionHeading eyebrow="Example Rally" title="A complete five-step possession" copy="The court updates as the tutorial walks through Dive, Assist, Set, Spike, and recovery." />
        <CourtDiagram step={step} />
      </CardShell>

      <CardShell>
        <p className="text-sm font-black uppercase tracking-[0.22em] text-amber-700">Guided Possession</p>
        <h2 className="mt-2 font-fantasy text-3xl font-black text-cyan-950">{rallySteps[step].title}</h2>
        <p className="mt-4 min-h-28 text-sm font-semibold leading-7 text-cyan-950/75">{rallySteps[step].body}</p>

        <div className="mt-6 flex gap-2">
          {rallySteps.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setStep(index)}
              aria-label={`Show rally step ${index + 1}`}
              className={`h-3 flex-1 rounded-full transition-colors ${index === step ? 'bg-amber-400' : 'bg-cyan-100 hover:bg-cyan-200'}`}
            />
          ))}
        </div>

        <div className="mt-6 flex justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep(value => Math.max(0, value - 1))}
            disabled={step === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-800 px-4 py-2 text-sm font-black text-white disabled:bg-slate-300"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <button
            type="button"
            onClick={() => setStep(value => Math.min(rallySteps.length - 1, value + 1))}
            disabled={step === rallySteps.length - 1}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-800 px-4 py-2 text-sm font-black text-white disabled:bg-slate-300"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </CardShell>
    </div>
  );
};

const CourtDiagram: React.FC<{ step: number }> = ({ step }) => {
  const active = rallySteps[step].highlight;
  const tokenClass = (token: RallyHighlight) =>
    active === token ? 'fill-amber-300 stroke-amber-50' : 'fill-white stroke-cyan-100';

  return (
    <div className="overflow-hidden rounded-lg border-4 border-cyan-950 bg-cyan-200 shadow-inner">
      <svg viewBox="0 0 760 420" className="h-auto w-full" role="img" aria-label="Top-down Arcane Volley court showing the current tutorial step">
        <defs>
          <pattern id="volley-grid" width="38" height="38" patternUnits="userSpaceOnUse">
            <path d="M 38 0 L 0 0 0 38" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.55" />
          </pattern>
          <marker id="volley-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>

        <rect x="20" y="20" width="720" height="380" rx="20" fill="#38bdf8" />
        <rect x="20" y="20" width="360" height="380" rx="20" fill="#67e8f9" opacity="0.82" />
        <rect x="380" y="20" width="360" height="380" rx="20" fill="#fda4af" opacity="0.56" />
        <rect x="20" y="20" width="720" height="380" rx="20" fill="url(#volley-grid)" />
        <line x1="380" y1="20" x2="380" y2="400" stroke="#083344" strokeWidth="7" />
        <text x="365" y="45" fill="#083344" fontSize="14" fontWeight="800" textAnchor="end">Heroes</text>
        <text x="395" y="45" fill="#083344" fontSize="14" fontWeight="800">Rivals</text>

        <rect x="95" y="270" width="38" height="38" rx="5" fill={active === 'diver' ? '#f59e0b' : '#fef3c7'} stroke="#083344" strokeWidth="3" />
        <circle cx="114" cy="289" r="8" fill="#f97316" />

        <PlayerToken x={105} y={210} label="D" activeClass={tokenClass('diver')} />
        <PlayerToken x={235} y={195} label="S" activeClass={tokenClass('setter')} />
        <PlayerToken x={315} y={115} label="P" activeClass={tokenClass('spiker')} />
        <PlayerToken x={280} y={295} label="R" activeClass={tokenClass('recover')} />

        {[['440', '285'], ['525', '195'], ['650', '120'], ['635', '310']].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="18" fill="#fb7185" stroke="#fecdd3" strokeWidth="4" />
        ))}

        {active === 'diver' && <VolleyPath d="M 105 210 Q 70 245 110 285" dashed />}
        {active === 'assist' && (
          <>
            <VolleyPath d="M 105 210 Q 185 105 285 120" dashed />
            <circle cx="296" cy="116" r="38" fill="none" stroke="#f59e0b" strokeWidth="5" />
          </>
        )}
        {active === 'setter' && <VolleyPath d="M 115 285 Q 185 245 235 195 Q 280 150 315 115" />}
        {active === 'spiker' && <VolleyPath d="M 315 115 Q 440 80 525 195" strong />}
        {active === 'recover' && (
          <>
            <text x="270" y="355" fill="#b45309" fontSize="24" fontWeight="900">+1</text>
            <text x="205" y="170" fill="#b45309" fontSize="24" fontWeight="900">+1</text>
          </>
        )}

        <text x="34" y="392" fill="#083344" fontSize="13" fontWeight="700">Each grid square represents 5 feet.</text>
      </svg>
    </div>
  );
};

const PlayerToken: React.FC<{ x: number; y: number; label: string; activeClass: string }> = ({ x, y, label, activeClass }) => (
  <>
    <circle cx={x} cy={y} r="18" className={activeClass} strokeWidth="4" />
    <text x={x} y={y + 6} fill="#083344" fontSize="15" fontWeight="900" textAnchor="middle">{label}</text>
  </>
);

const VolleyPath: React.FC<{ d: string; dashed?: boolean; strong?: boolean }> = ({ d, dashed = false, strong = false }) => (
  <path
    d={d}
    fill="none"
    stroke="#f59e0b"
    strokeWidth={strong ? 7 : 6}
    strokeDasharray={dashed ? '10 8' : undefined}
    markerEnd="url(#volley-arrow)"
  />
);

const StaminaRules: React.FC = () => (
  <div className="space-y-6">
    <RecoveryTrainer />
    <section className="grid gap-4 md:grid-cols-3">
      {[
        ['Dive, Stride, Recover', 'Reaction + 3 actions', 'Dive, Stride, then Take a Breather twice. Recover 2 Stamina.'],
        ['Dive and Full Rest', 'Reaction + 3 actions', 'Dive, then use Take a Rest. Recover 4 Stamina.'],
        ['Dive, Assist, Recover', 'Reaction + 3 actions', 'Dive, Stride, Assist, then Take a Breather. Recover 1 Stamina.']
      ].map(([title, actions, detail]) => (
        <article key={title} className="rounded-lg border border-cyan-900/15 bg-white p-5 shadow-xl shadow-cyan-950/10">
          <p className="text-xs font-black uppercase tracking-widest text-cyan-700">{actions}</p>
          <h3 className="mt-2 font-fantasy text-2xl font-black text-cyan-950">{title}</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-cyan-950/75">{detail}</p>
        </article>
      ))}
    </section>
    <div className="rounded-lg border border-sky-200 bg-sky-50 p-5 text-sm font-bold leading-6 text-cyan-950">
      Stamina never returns automatically. A player at 0 Stamina can still use every normal action and reaction; they simply cannot boost distance or pay special costs.
    </div>
  </div>
);

const RecoveryTrainer: React.FC = () => {
  const [stamina, setStamina] = useState(1);
  const [actions, setActions] = useState(3);
  const [message, setMessage] = useState('Choose how to spend this player\'s remaining actions.');

  const breathe = () => {
    if (actions < 1) return;
    const next = Math.min(5, stamina + 1);
    setStamina(next);
    setActions(value => value - 1);
    setMessage(next === stamina ? 'Stamina is already full.' : 'Take a Breather: +1 Stamina.');
  };

  const rest = () => {
    if (actions < 3) return;
    const next = Math.min(5, stamina + 4);
    setStamina(next);
    setActions(0);
    setMessage(next === stamina ? 'Stamina is already full.' : 'Take a Rest: +4 Stamina.');
  };

  const reset = () => {
    setStamina(1);
    setActions(3);
    setMessage('Choose how to spend this player\'s remaining actions.');
  };

  return (
    <CardShell>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <SectionHeading eyebrow="Interactive Example" title="Recovery Planner" copy="Stamina never returns automatically. Spend spare actions during your possession to recover it." />
        <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-800 px-4 py-2 text-sm font-black text-white hover:bg-cyan-700">
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-cyan-950 p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-cyan-100">Stamina</span>
            <span className="text-lg font-black">{stamina}/5</span>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className={`h-5 rounded ${index < stamina ? 'bg-emerald-400' : 'bg-cyan-900'}`} />
            ))}
          </div>

          <div className="mt-7 flex items-center justify-between">
            <span className="text-sm font-bold text-cyan-100">Actions remaining</span>
            <div className="flex gap-2">
              {Array.from({ length: 3 }, (_, index) => (
                <span key={index} className={`h-8 w-8 rounded-full border-2 ${index < actions ? 'border-sky-100 bg-sky-400' : 'border-cyan-800 bg-cyan-900'}`} />
              ))}
            </div>
          </div>

          <p className="mt-6 min-h-12 rounded-lg bg-cyan-900 px-4 py-3 text-sm font-semibold text-cyan-50">{message}</p>
        </div>

        <div className="grid gap-4">
          <RecoveryButton cost="1 Action" title="Take a Breather" detail="Recover 1 Stamina." disabled={actions < 1} tone="emerald" onClick={breathe} />
          <RecoveryButton cost="3 Actions" title="Take a Rest" detail="Recover 4 Stamina." disabled={actions < 3} tone="amber" onClick={rest} />
        </div>
      </div>
    </CardShell>
  );
};

const RecoveryButton: React.FC<{
  cost: string;
  title: string;
  detail: string;
  disabled: boolean;
  tone: 'emerald' | 'amber';
  onClick: () => void;
}> = ({ cost, title, detail, disabled, tone, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-lg border p-5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
        : 'border-amber-200 bg-amber-50 hover:bg-amber-100'
    }`}
  >
    <span className="text-xs font-black uppercase tracking-widest text-cyan-700">{cost}</span>
    <span className="mt-2 block font-fantasy text-2xl font-black text-cyan-950">{title}</span>
    <span className="mt-2 block text-sm font-semibold text-cyan-950/75">{detail}</span>
  </button>
);

const BlockRules: React.FC = () => (
  <div className="space-y-6">
    <section className="grid gap-6 lg:grid-cols-2">
      <BlockCard eyebrow="Against a Spike" title="Normal Block" cost="Reaction | 0 Stamina" copy="When an enemy within 10 feet Spikes, spend your reaction to intercept it. Return the ball immediately as a Pass to a square within 10 feet." tone="rose" />
      <BlockCard eyebrow="Against a Pass" title="Power Block" cost="Reaction + 3 Stamina" copy="When an enemy within 10 feet sends any Pass, spend your reaction and 3 Stamina. Return it immediately as a Spike to a square within 10 feet." tone="amber" />
    </section>

    <CardShell>
      <SectionHeading eyebrow="Pass or Spike?" title="How defenders respond" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-sky-50 p-5">
          <h3 className="font-fantasy text-2xl font-black text-cyan-950">Pass</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-cyan-950/75">Defenders may use actions before receiving it. A Pass may be Power Blocked.</p>
        </div>
        <div className="rounded-lg bg-rose-50 p-5">
          <h3 className="font-fantasy text-2xl font-black text-cyan-950">Spike</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-cyan-950/75">Defenders cannot Stride first. Receive it with Set from the landing square, Dive, or Normal Block.</p>
        </div>
      </div>
    </CardShell>

    <div className="rounded-lg border border-violet-200 bg-violet-50 p-5 text-sm font-bold leading-6 text-cyan-950">
      After a Block return, the opposing team begins a new possession with refreshed actions and reactions. No Stamina is recovered automatically.
    </div>
  </div>
);

const BlockCard: React.FC<{ eyebrow: string; title: string; cost: string; copy: string; tone: 'rose' | 'amber' }> = ({ eyebrow, title, cost, copy, tone }) => (
  <article className={`rounded-lg border p-5 shadow-xl shadow-cyan-950/10 ${tone === 'rose' ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
    <p className="text-sm font-black uppercase tracking-[0.22em] text-cyan-700">{eyebrow}</p>
    <h2 className="mt-2 font-fantasy text-3xl font-black text-cyan-950">{title}</h2>
    <p className="mt-4 text-sm font-semibold leading-6 text-cyan-950/75">{copy}</p>
    <div className="mt-5 rounded-lg bg-cyan-950 px-4 py-3 text-sm font-black text-white">Cost: {cost}</div>
  </article>
);

const PlayerQuickReference: React.FC = () => (
  <CardShell>
    <SectionHeading eyebrow="Player Quick Reference" title="Options, costs, and effects" />
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-cyan-900/15 text-cyan-800">
            <th className="px-3 py-3 font-black">Option</th>
            <th className="px-3 py-3 font-black">Cost</th>
            <th className="px-3 py-3 font-black">Requirement</th>
            <th className="px-3 py-3 font-black">Effect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cyan-900/10 text-cyan-950">
          {quickReferenceRows.map(row => (
            <tr key={row[0]}>
              {row.map(cell => <td key={`${row[0]}-${cell}`} className="px-3 py-4 align-top font-semibold">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <p className="mt-5 text-sm font-black text-amber-700">
      Universal boost: spend 1 Stamina to add 5 feet to an eligible movement or ball-placement range.
    </p>
  </CardShell>
);

const QuickReferencePanel: React.FC<{ compact: boolean; sticky?: boolean }> = ({ compact, sticky = false }) => (
  <aside className={`${sticky ? 'sticky top-36' : ''} rounded-lg border border-cyan-900/15 bg-cyan-950 p-5 text-white shadow-xl shadow-cyan-950/20 ${compact ? 'rounded-none border-0 bg-cyan-950 px-4 pb-5 pt-0' : ''}`}>
    <div className="mb-4 flex items-center gap-2">
      <Sparkles className="h-5 w-5 text-amber-300" />
      <h2 className="font-fantasy text-2xl font-black">Quick Reference</h2>
    </div>
    <ul className="grid gap-3 text-sm font-semibold leading-6 text-cyan-50">
      <li>Four players per team.</li>
      <li>Maximum three touches per possession.</li>
      <li>One touch per player per possession.</li>
      <li>Each player has 3 actions and 1 reaction.</li>
      <li>Normal actions and reactions cost no Stamina.</li>
      <li>Spend 1 Stamina for +5 feet to eligible movement or placement.</li>
      <li>Stamina never returns automatically.</li>
      <li>Spike blocks Stride after target declaration.</li>
    </ul>
    <div className="mt-5 grid grid-cols-2 gap-2 text-xs font-black uppercase tracking-wide">
      <span className="rounded bg-cyan-900 px-3 py-2">Dive</span>
      <span className="rounded bg-cyan-900 px-3 py-2">Set</span>
      <span className="rounded bg-cyan-900 px-3 py-2">Spike</span>
      <span className="rounded bg-cyan-900 px-3 py-2">Block</span>
    </div>
  </aside>
);

export default EventPage;
