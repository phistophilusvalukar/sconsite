import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Copy, Eye, Gauge, Link as LinkIcon, Lock, RotateCcw, Shuffle, Users, Wrench, XCircle } from 'lucide-react';
import { DATABASE_TABLES } from '../config/database';
import { useAuth } from '../context/useAuth';
import { useSupabaseRealtime } from '../hooks/useSupabaseRealtime';
import LockChallengeService, {
  LockChallenge,
  LockChallengeStateUpdate,
  LockDifficulty,
  LockChallengeStatus
} from '../services/lockChallengeService';

const LOCK_MIN_ANGLE = -74;
const LOCK_MAX_ANGLE = 74;
const OPEN_ROTATION = 92;
const RELEASE_SPEED = 44;
const PICK_MAX_HEALTH = 100;
const LOCK_CENTER = { x: 50, y: 50 };

interface DifficultyProfile {
  label: LockDifficulty;
  sweetSpot: number;
  speed: number;
  bind: number;
  dc: number;
}

const difficultyProfiles: DifficultyProfile[] = [
  { label: 'Training', sweetSpot: 18, speed: 92, bind: 82, dc: 15 },
  { label: 'Standard', sweetSpot: 12, speed: 80, bind: 62, dc: 20 },
  { label: 'Expert', sweetSpot: 8, speed: 68, bind: 46, dc: 30 },
  { label: 'Master', sweetSpot: 5, speed: 58, bind: 32, dc: 40 }
];

type LockGameMode = 'practice' | 'player' | 'spectator' | 'gm';

interface LockGameState {
  pickAngle: number;
  rotation: number;
  pickHealth: number;
  picksRemaining: number;
  brokenPicks: number;
  lastResult: string;
  isTesting: boolean;
  isUnlocked: boolean;
  status: LockChallengeStatus;
}

const randomSweetSpot = () =>
  Math.round(LOCK_MIN_ANGLE + Math.random() * (LOCK_MAX_ANGLE - LOCK_MIN_ANGLE));

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const formatAngle = (angle: number) =>
  `${angle > 0 ? '+' : ''}${Math.round(angle)}deg`;

const getProfile = (difficulty: LockDifficulty) =>
  difficultyProfiles.find(item => item.label === difficulty) || difficultyProfiles[1];

const challengeToGameState = (challenge: LockChallenge): LockGameState => ({
  pickAngle: challenge.pickAngle,
  rotation: challenge.rotation,
  pickHealth: challenge.pickHealth,
  picksRemaining: challenge.picksRemaining,
  brokenPicks: challenge.brokenPicks,
  lastResult: challenge.lastResult,
  isTesting: challenge.isTesting,
  isUnlocked: challenge.isUnlocked,
  status: challenge.status
});

const SkillChecksPage: React.FC = () => {
  const location = useLocation();

  if (location.pathname.startsWith('/lock-challenge/')) {
    return <PublicChallengePage />;
  }

  if (location.pathname === '/skill-checks/challenges') {
    return <ChallengeManagerPage />;
  }

  return <PracticePage />;
};

const PracticePage: React.FC = () => {
  const [difficulty, setDifficulty] = useState<LockDifficulty>('Standard');
  const [dc, setDc] = useState(20);
  const [sweetSpot, setSweetSpot] = useState(() => randomSweetSpot());
  const [resetKey, setResetKey] = useState(0);

  const handleDifficultyChange = (nextDifficulty: LockDifficulty) => {
    const nextProfile = getProfile(nextDifficulty);
    setDifficulty(nextDifficulty);
    setDc(nextProfile.dc);
    setSweetSpot(randomSweetSpot());
    setResetKey(key => key + 1);
  };

  const resetLock = (keepSweetSpot = true) => {
    if (!keepSweetSpot) {
      setSweetSpot(randomSweetSpot());
    }
    setResetKey(key => key + 1);
  };

  return (
    <PageShell
      eyebrow="GM Skill Checks"
      title="Thievery: Lockpicking"
      actions={(
        <>
          <Link to="/skill-checks/challenges" className="inline-flex items-center gap-2 rounded-lg bg-fantasy-800 px-4 py-2 text-sm font-bold text-gray-100 hover:bg-fantasy-700">
            <Users className="h-4 w-4" />
            <span>Challenges</span>
          </Link>
          <button type="button" onClick={() => resetLock()} className="inline-flex items-center gap-2 rounded-lg bg-fantasy-800 px-4 py-2 text-sm font-bold text-gray-100 hover:bg-fantasy-700">
            <RotateCcw className="h-4 w-4" />
            <span>Reset</span>
          </button>
          <button type="button" onClick={() => resetLock(false)} className="inline-flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-midnight-950 hover:bg-yellow-400">
            <Shuffle className="h-4 w-4" />
            <span>New Lock</span>
          </button>
        </>
      )}
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <LockGame key={resetKey} mode="practice" difficulty={difficulty} sweetSpot={sweetSpot} pickCount={999} />
        <aside className="space-y-5">
          <section className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 p-5 shadow-xl shadow-midnight-950/30">
            <h2 className="font-fantasy text-2xl font-bold">Lock Setup</h2>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-300">Quality</span>
                <select value={difficulty} onChange={event => handleDifficultyChange(event.target.value as LockDifficulty)} className="w-full rounded-lg border border-fantasy-700/35 bg-fantasy-900/70 p-3 text-white">
                  {difficultyProfiles.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-300">DC</span>
                <input type="number" min={5} max={60} value={dc} onChange={event => setDc(Number(event.target.value))} className="w-full rounded-lg border border-fantasy-700/35 bg-fantasy-900/70 p-3 text-white" />
              </label>
            </div>
          </section>
        </aside>
      </div>
    </PageShell>
  );
};

const ChallengeManagerPage: React.FC = () => {
  const { isAuthenticated, user } = useAuth();
  const service = useMemo(() => LockChallengeService.getInstance(), []);
  const [difficulty, setDifficulty] = useState<LockDifficulty>('Standard');
  const [pickCount, setPickCount] = useState(3);
  const [challenges, setChallenges] = useState<LockChallenge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadChallenges = useCallback(async () => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const response = await service.getGmChallenges(user.id);
    if (response.success && response.data) {
      setChallenges(response.data);
    } else {
      setMessage(response.error || 'Unable to load lock challenges.');
    }
    setIsLoading(false);
  }, [service, user?.id]);

  useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  useSupabaseRealtime({
    channelName: `lock-challenges-gm-${user?.id || 'anonymous'}`,
    tables: [DATABASE_TABLES.LOCK_CHALLENGES],
    onChange: loadChallenges,
    enabled: Boolean(user?.id)
  });

  const createChallenge = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;

    setIsSaving(true);
    setMessage(null);
    const response = await service.createChallenge({
      gmId: user.id,
      gmName: user.username,
      difficulty,
      pickCount
    });
    if (response.success) {
      setMessage('Challenge created.');
      await loadChallenges();
    } else {
      setMessage(response.error || 'Unable to create challenge.');
    }
    setIsSaving(false);
  };

  const closeChallenge = async (challengeId: string) => {
    if (!user?.id) return;
    const response = await service.closeChallenge(challengeId, user.id);
    setMessage(response.success ? 'Challenge closed.' : response.error || 'Unable to close challenge.');
    await loadChallenges();
  };

  return (
    <PageShell
      eyebrow="GM Skill Checks"
      title="Lock Challenges"
      actions={<Link to="/skill-checks" className="inline-flex items-center gap-2 rounded-lg bg-fantasy-800 px-4 py-2 text-sm font-bold text-gray-100 hover:bg-fantasy-700"><Lock className="h-4 w-4" /><span>Practice</span></Link>}
    >
      {!isAuthenticated ? (
        <section className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 p-6 text-gray-200">
          Sign in as a GM to create lock challenges.
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <form onSubmit={createChallenge} className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 p-5">
            <h2 className="font-fantasy text-2xl font-bold">New Challenge</h2>
            <div className="mt-5 space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-300">Difficulty</span>
                <select value={difficulty} onChange={event => setDifficulty(event.target.value as LockDifficulty)} className="w-full rounded-lg border border-fantasy-700/35 bg-fantasy-900/70 p-3 text-white">
                  {difficultyProfiles.map(item => <option key={item.label} value={item.label}>{item.label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-gray-300">Lockpicks</span>
                <input type="number" min={1} max={20} value={pickCount} onChange={event => setPickCount(clamp(Number(event.target.value), 1, 20))} className="w-full rounded-lg border border-fantasy-700/35 bg-fantasy-900/70 p-3 text-white" />
              </label>
              <button type="submit" disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-500 px-4 py-3 font-bold text-midnight-950 hover:bg-yellow-400 disabled:bg-gray-600 disabled:text-gray-300">
                <LinkIcon className="h-4 w-4" />
                <span>{isSaving ? 'Creating...' : 'Create URLs'}</span>
              </button>
              {message && <p className="text-sm text-yellow-100">{message}</p>}
            </div>
          </form>

          <section className="space-y-4">
            {isLoading && <div className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 p-5 text-gray-300">Loading challenges...</div>}
            {!isLoading && challenges.length === 0 && <div className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 p-5 text-gray-300">No lock challenges yet.</div>}
            {challenges.map(challenge => (
              <ChallengeCard key={challenge.id} challenge={challenge} onClose={() => void closeChallenge(challenge.id)} />
            ))}
          </section>
        </div>
      )}
    </PageShell>
  );
};

const ChallengeCard: React.FC<{ challenge: LockChallenge; onClose: () => void }> = ({ challenge, onClose }) => {
  const baseUrl = window.location.origin;
  const playerUrl = `${baseUrl}/lock-challenge/${challenge.id}/player/${challenge.playerToken}`;
  const spectatorUrl = `${baseUrl}/lock-challenge/${challenge.id}/spectate/${challenge.spectatorToken}`;

  return (
    <article className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-yellow-300">{challenge.status}</p>
          <h3 className="font-fantasy text-2xl font-bold text-white">{challenge.difficulty} Lock</h3>
          <p className="mt-1 text-sm text-gray-400">{challenge.picksRemaining}/{challenge.pickCount} picks remaining</p>
        </div>
        {challenge.status !== 'Closed' && (
          <button type="button" onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-600">
            <XCircle className="h-4 w-4" />
            <span>Close</span>
          </button>
        )}
      </div>
      {challenge.status !== 'Closed' && challenge.playerToken && challenge.spectatorToken && (
        <div className="mt-5 grid gap-3">
          <UrlRow label="Player URL" url={playerUrl} />
          <UrlRow label="Spectator URL" url={spectatorUrl} />
        </div>
      )}
    </article>
  );
};

const PublicChallengePage: React.FC = () => {
  const { challengeId = '', token = '' } = useParams();
  const location = useLocation();
  const service = useMemo(() => LockChallengeService.getInstance(), []);
  const isPlayer = location.pathname.includes('/player/');
  const [challenge, setChallenge] = useState<LockChallenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadChallenge = useCallback(async () => {
    if (!challengeId || !token) return;
    const response = isPlayer
      ? await service.getByPlayerToken(challengeId, token)
      : await service.getBySpectatorToken(challengeId, token);

    if (response.success && response.data) {
      setChallenge(response.data);
      setError(null);
    } else {
      setError(response.error || 'This challenge is closed or unavailable.');
    }
    setIsLoading(false);
  }, [challengeId, isPlayer, service, token]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  useEffect(() => {
    if (!challengeId || !token) return;

    const interval = window.setInterval(() => {
      void loadChallenge();
    }, 900);

    return () => window.clearInterval(interval);
  }, [challengeId, loadChallenge, token]);

  const updatePlayerState = async (state: LockChallengeStateUpdate) => {
    if (!challengeId || !token || !isPlayer) return;
    const response = await service.updatePlayerState(challengeId, token, state);
    if (response.success && response.data) {
      setChallenge(response.data);
    }
  };

  if (isLoading) {
    return <CenteredMessage message="Loading lock challenge..." />;
  }

  if (error || !challenge) {
    return <CenteredMessage message={error || 'Challenge unavailable.'} />;
  }

  return (
    <div className="min-h-screen px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-lg border border-fantasy-700/35 bg-midnight-950/65 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-widest text-yellow-300">Lockpicks</p>
            <p className="text-2xl font-bold">{challenge.picksRemaining}</p>
          </div>
          {!isPlayer && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-fantasy-700/35 bg-midnight-950/65 px-4 py-3 text-sm font-bold text-gray-200">
              <Eye className="h-4 w-4 text-yellow-300" />
              <span>Spectating</span>
            </div>
          )}
        </div>

        {challenge.status === 'Success' && <OutcomeBanner tone="success" text="Success! The lock opens." />}
        {challenge.status === 'Failure' && <OutcomeBanner tone="failure" text="Failure. All lockpicks are broken." />}

        <LockGame
          key={`${challenge.id}-${isPlayer ? 'player' : 'spectator'}`}
          mode={isPlayer ? 'player' : 'spectator'}
          difficulty={challenge.difficulty}
          sweetSpot={challenge.sweetSpot}
          pickCount={challenge.pickCount}
          challengeState={challengeToGameState(challenge)}
          onChallengeStateChange={updatePlayerState}
        />
      </div>
    </div>
  );
};

const LockGame: React.FC<{
  mode: LockGameMode;
  difficulty: LockDifficulty;
  sweetSpot?: number;
  pickCount: number;
  challengeState?: LockGameState;
  onChallengeStateChange?: (state: LockChallengeStateUpdate) => void | Promise<void>;
}> = ({ mode, difficulty, sweetSpot: providedSweetSpot, pickCount, challengeState, onChallengeStateChange }) => {
  const isInteractive = mode === 'practice' || mode === 'player';
  const hideStats = mode === 'player' || mode === 'spectator';
  const readOnly = mode === 'spectator' || mode === 'gm';
  const profile = useMemo(() => getProfile(difficulty), [difficulty]);
  const lockRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number>();
  const previousFrameRef = useRef<number>();
  const syncTimerRef = useRef<number>();
  const lastSyncedRef = useRef<string>('');
  const [sweetSpot] = useState(() => providedSweetSpot ?? randomSweetSpot());
  const [pickAngle, setPickAngle] = useState(challengeState?.pickAngle ?? 0);
  const [rotation, setRotation] = useState(challengeState?.rotation ?? 0);
  const [isTesting, setIsTesting] = useState(challengeState?.isTesting ?? false);
  const [isUnlocked, setIsUnlocked] = useState(challengeState?.isUnlocked ?? false);
  const [vibration, setVibration] = useState(0);
  const [pickHealth, setPickHealth] = useState(challengeState?.pickHealth ?? PICK_MAX_HEALTH);
  const [picksRemaining, setPicksRemaining] = useState(challengeState?.picksRemaining ?? pickCount);
  const [brokenPicks, setBrokenPicks] = useState(challengeState?.brokenPicks ?? 0);
  const [status, setStatus] = useState<LockChallengeStatus>(challengeState?.status ?? 'Active');
  const [lastResult, setLastResult] = useState(challengeState?.lastResult ?? 'Awaiting thievery check');

  useEffect(() => {
    if (!challengeState || isInteractive) return;
    setPickAngle(challengeState.pickAngle);
    setRotation(challengeState.rotation);
    setPickHealth(challengeState.pickHealth);
    setPicksRemaining(challengeState.picksRemaining);
    setBrokenPicks(challengeState.brokenPicks);
    setIsTesting(challengeState.isTesting);
    setIsUnlocked(challengeState.isUnlocked);
    setStatus(challengeState.status);
    setLastResult(challengeState.lastResult);
  }, [challengeState, isInteractive]);

  const precision = useMemo(() => {
    const miss = Math.abs(pickAngle - sweetSpot);
    return clamp(1 - miss / (profile.sweetSpot * 4.5), 0, 1);
  }, [pickAngle, profile.sweetSpot, sweetSpot]);

  const emitChallengeState = useCallback((nextState: LockChallengeStateUpdate) => {
    if (!onChallengeStateChange) return;
    const syncKey = JSON.stringify({
      a: Math.round(nextState.pickAngle),
      r: Math.round(nextState.rotation),
      h: Math.round(nextState.pickHealth),
      p: nextState.picksRemaining,
      b: nextState.brokenPicks,
      s: nextState.status,
      t: nextState.isTesting,
      u: nextState.isUnlocked,
      l: nextState.lastResult
    });

    if (syncKey === lastSyncedRef.current) return;
    lastSyncedRef.current = syncKey;

    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      void onChallengeStateChange(nextState);
    }, 180);
  }, [onChallengeStateChange]);

  useEffect(() => () => {
    if (syncTimerRef.current) window.clearTimeout(syncTimerRef.current);
  }, []);

  const updatePickFromPointer = useCallback((clientX: number, clientY: number) => {
    if (!lockRef.current || !isInteractive || isTesting || isUnlocked || status !== 'Active') return;
    const bounds = lockRef.current.getBoundingClientRect();
    const centerX = bounds.left + bounds.width * (LOCK_CENTER.x / 100);
    const centerY = bounds.top + bounds.height * (LOCK_CENTER.y / 100);
    const nextAngle = Math.atan2(clientX - centerX, centerY - clientY) * (180 / Math.PI);
    setPickAngle(clamp(nextAngle, LOCK_MIN_ANGLE, LOCK_MAX_ANGLE));
  }, [isInteractive, isTesting, isUnlocked, status]);

  useEffect(() => {
    if (readOnly) return;

    const tick = (timestamp: number) => {
      const previous = previousFrameRef.current ?? timestamp;
      const elapsedSeconds = Math.min((timestamp - previous) / 1000, 0.05);
      previousFrameRef.current = timestamp;

      if (status !== 'Active') {
        setVibration(0);
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (isUnlocked) {
        setVibration(0);
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      if (!isTesting) {
        setVibration(0);
        setRotation(current => Math.max(0, current - RELEASE_SPEED * elapsedSeconds));
        animationRef.current = window.requestAnimationFrame(tick);
        return;
      }

      const miss = Math.abs(pickAngle - sweetSpot);
      const isInSweetSpot = miss <= profile.sweetSpot;
      const maxBadRotation = clamp(profile.bind * Math.max(0.12, precision), 9, profile.bind);

      setRotation(current => {
        const target = isInSweetSpot ? OPEN_ROTATION : maxBadRotation;
        const direction = current < target ? 1 : -1;
        const speed = (isInSweetSpot ? profile.speed : profile.speed * 1.35) * elapsedSeconds;
        const next = current + direction * speed;

        if (isInSweetSpot && next >= OPEN_ROTATION - 1) {
          setIsUnlocked(true);
          setIsTesting(false);
          setVibration(0);
          setStatus('Success');
          setLastResult(`Unlocked at ${formatAngle(pickAngle)}`);
          return OPEN_ROTATION;
        }

        if (!isInSweetSpot && next >= target - 0.75) {
          setVibration(Math.random() * 9 + 5);
          setLastResult(`Binding at ${Math.round(target)}% turn`);
          setPickHealth(currentHealth => {
            const damage = (26 + miss * 0.65) * elapsedSeconds;
            const nextHealth = Math.max(0, currentHealth - damage);

            if (nextHealth <= 0) {
              setBrokenPicks(count => count + 1);
              setPicksRemaining(currentPicks => {
                const nextPicks = Math.max(0, currentPicks - 1);
                if (nextPicks <= 0) {
                  setStatus('Failure');
                  setIsTesting(false);
                  setVibration(0);
                  setLastResult('All lockpicks are broken.');
                  return 0;
                }
                setPickAngle(0);
                setIsTesting(false);
                setVibration(0);
                setLastResult('Pick broke. New pick inserted.');
                window.setTimeout(() => setPickHealth(PICK_MAX_HEALTH), 150);
                return nextPicks;
              });
            }

            return nextHealth;
          });
          return target;
        }

        setVibration(isInSweetSpot ? 0 : Math.random() * 5);
        return clamp(next, 0, OPEN_ROTATION);
      });

      animationRef.current = window.requestAnimationFrame(tick);
    };

    animationRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
    };
  }, [isTesting, isUnlocked, pickAngle, precision, profile, readOnly, status, sweetSpot]);

  useEffect(() => {
    if (mode !== 'player') return;
    emitChallengeState({
      pickAngle,
      rotation,
      pickHealth,
      picksRemaining,
      brokenPicks,
      lastResult,
      isTesting,
      isUnlocked,
      status
    });
  }, [brokenPicks, emitChallengeState, isTesting, isUnlocked, lastResult, mode, pickAngle, pickHealth, picksRemaining, rotation, status]);

  const centerPositionStyle = {
    left: `${LOCK_CENTER.x}%`,
    top: `${LOCK_CENTER.y}%`
  };
  const activeRotation = rotation + (isTesting && !isUnlocked ? vibration : 0);
  const rotationStyle = {
    ...centerPositionStyle,
    transform: `translate(-50%, -50%) rotate(${activeRotation}deg)`
  };
  const rotatingLockFaceStyle = {
    clipPath: 'ellipse(14.8% 26.4% at 50% 50%)'
  };
  const rotatingLockImageStyle = {
    transform: `rotate(${activeRotation}deg)`,
    transformOrigin: '50% 50%'
  };
  const pickStyle = {
    ...centerPositionStyle,
    transform: `translate(-50%, -100%) rotate(${pickAngle}deg)`
  };
  const wrenchStyle = {
    left: `${LOCK_CENTER.x}%`,
    top: `${LOCK_CENTER.y + 7}%`,
    transform: `translate(-4%, -50%) rotate(${28 + activeRotation * 0.95}deg)`
  };

  return (
    <section className="overflow-hidden rounded-lg border border-fantasy-700/35 bg-midnight-950/65 shadow-2xl shadow-midnight-950/40">
      <div
        ref={lockRef}
        className={`relative aspect-[16/9] min-h-[360px] select-none overflow-hidden bg-midnight-950 ${isInteractive ? 'touch-none' : ''}`}
        onPointerMove={event => updatePickFromPointer(event.clientX, event.clientY)}
        onPointerDown={event => {
          updatePickFromPointer(event.clientX, event.clientY);
          event.currentTarget.setPointerCapture(event.pointerId);
          if (isInteractive && !isUnlocked && status === 'Active' && picksRemaining > 0) {
            setIsTesting(true);
            setLastResult('Testing lock');
          }
        }}
        onPointerUp={() => setIsTesting(false)}
        onPointerCancel={() => setIsTesting(false)}
        onPointerLeave={() => setIsTesting(false)}
      >
        <img src="/lockpicking-workbench.png" alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,transparent_46%,rgba(2,6,23,0.5)_100%)]" />
        <div className="absolute inset-0" style={rotatingLockFaceStyle}>
          <img src="/lockpicking-workbench.png" alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} style={rotatingLockImageStyle} />
        </div>
        <div className="absolute h-[24%] w-[13.5%] rounded-full border border-yellow-100/15 bg-black/10 shadow-[inset_0_0_24px_rgba(0,0,0,0.65)]" style={rotationStyle}>
          <div className="absolute left-1/2 top-[24%] h-[52%] w-[16%] -translate-x-1/2 rounded-b-full bg-black/55 shadow-[0_0_18px_rgba(0,0,0,0.85)]" />
          <div className="absolute left-1/2 top-[23%] h-[26%] w-[24%] -translate-x-1/2 rounded-full bg-black/80" />
        </div>
        <div className="absolute h-[35%] w-[0.42rem] origin-bottom rounded-full bg-gradient-to-t from-zinc-900 via-zinc-400 to-zinc-100 shadow-[0_0_12px_rgba(245,245,245,0.25)]" style={pickStyle}>
          <div className="absolute -top-2 left-1/2 h-5 w-3 -translate-x-1/2 rounded-full bg-zinc-100/90" />
        </div>
        <div className="absolute h-[0.68rem] w-[35%] origin-left rounded-full bg-gradient-to-r from-stone-200 via-stone-500 to-stone-900 shadow-[0_8px_18px_rgba(0,0,0,0.55)]" style={wrenchStyle}>
          <div className="absolute -left-2 top-1/2 h-5 w-7 -translate-y-1/2 rounded-sm bg-stone-300 shadow-[inset_0_0_5px_rgba(0,0,0,0.5)] ring-1 ring-stone-100/40" />
          <div className="absolute right-0 top-1/2 h-8 w-16 -translate-y-1/2 rounded bg-gradient-to-r from-stone-600 to-stone-900 ring-1 ring-stone-300/30" />
        </div>

        {!hideStats && (
          <div className="absolute bottom-4 left-4 right-4 grid gap-3 rounded-lg border border-fantasy-700/30 bg-midnight-950/75 p-4 backdrop-blur sm:grid-cols-4">
            <Readout icon={<Gauge className="h-4 w-4" />} label="Turn" value={`${Math.round((rotation / OPEN_ROTATION) * 100)}%`} />
            <Readout icon={<Wrench className="h-4 w-4" />} label="Pick" value={formatAngle(pickAngle)} />
            <Readout label="Durability" value={`${Math.ceil(pickHealth)}%`} />
            <Readout icon={<CheckCircle2 className="h-4 w-4" />} label="State" value={isUnlocked ? 'Open' : lastResult} />
          </div>
        )}
      </div>
    </section>
  );
};

const PageShell: React.FC<{
  eyebrow: string;
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ eyebrow, title, actions, children }) => (
  <div className="min-h-screen px-4 py-10 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-7xl">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.28em] text-yellow-300">{eyebrow}</p>
          <h1 className="mt-3 font-fantasy text-4xl font-bold sm:text-5xl">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  </div>
);

const UrlRow: React.FC<{ label: string; url: string }> = ({ label, url }) => (
  <div className="rounded-lg border border-fantasy-700/30 bg-midnight-950/55 p-3">
    <div className="mb-2 text-xs font-bold uppercase tracking-widest text-yellow-300">{label}</div>
    <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
      <input readOnly value={url} className="min-w-0 rounded-lg border border-fantasy-700/35 bg-fantasy-900/70 p-3 text-sm text-white" />
      <button type="button" onClick={() => void navigator.clipboard?.writeText(url)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-fantasy-700 px-4 py-2 text-sm font-bold text-white hover:bg-fantasy-600">
        <Copy className="h-4 w-4" />
        <span>Copy</span>
      </button>
    </div>
  </div>
);

const OutcomeBanner: React.FC<{ tone: 'success' | 'failure'; text: string }> = ({ tone, text }) => (
  <div className={`mb-5 rounded-lg border p-4 text-center text-xl font-bold ${tone === 'success' ? 'border-emerald-400/50 bg-emerald-950/50 text-emerald-100' : 'border-red-400/50 bg-red-950/50 text-red-100'}`}>
    {text}
  </div>
);

const CenteredMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex min-h-screen items-center justify-center px-4 py-10 text-white">
    <div className="rounded-lg border border-fantasy-700/35 bg-midnight-950/75 p-6 text-center text-lg font-semibold text-gray-200">
      {message}
    </div>
  </div>
);

const Readout: React.FC<{ icon?: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div className="min-w-0 rounded-lg border border-fantasy-700/25 bg-midnight-950/55 px-3 py-2">
    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-yellow-300">
      {icon}
      <span>{label}</span>
    </div>
    <div className="mt-1 truncate text-base font-bold text-white">{value}</div>
  </div>
);

export default SkillChecksPage;
