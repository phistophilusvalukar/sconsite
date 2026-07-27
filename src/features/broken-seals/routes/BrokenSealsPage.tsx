import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronsRight,
  RotateCcw,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { brokenSealPuzzles, getBrokenSealPuzzle } from '../data/brokenSealPuzzles';
import {
  createSealWords,
  evaluateSealAttempt,
  moveSealWord,
  phraseWords,
  type BrokenSealPuzzle,
  type SealAttempt,
  type SealWord
} from '../engine/brokenSealEngine';
import './brokenSeals.css';

export default function BrokenSealsPage() {
  const [selectedPuzzleId, setSelectedPuzzleId] = useState(brokenSealPuzzles[0].id);
  const puzzle = getBrokenSealPuzzle(selectedPuzzleId);

  return (
    <div className="broken-seals-page">
      <section className="broken-seals-shell">
        <header className="broken-seals-header">
          <div>
            <p className="broken-seals-kicker">Arcane Lock Minigame</p>
            <h1>Broken Seals</h1>
          </div>
          <label className="seal-select-label">
            Seal
            <select value={selectedPuzzleId} onChange={(event) => setSelectedPuzzleId(event.target.value)}>
              {brokenSealPuzzles.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </header>
        <BrokenSealGame key={puzzle.id} puzzle={puzzle} />
      </section>
    </div>
  );
}

function BrokenSealGame({ puzzle }: { puzzle: BrokenSealPuzzle }) {
  const [words, setWords] = useState<SealWord[]>(() => createSealWords(puzzle.brokenWords, puzzle.id));
  const [attempts, setAttempts] = useState<SealAttempt[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [notice, setNotice] = useState('The seal is fractured, but still listening.');
  const targetWords = useMemo(() => phraseWords(puzzle.targetPhrase), [puzzle.targetPhrase]);
  const latestAttempt = attempts[0] ?? null;
  const revealedSlots = words.map((word, index) => (
    Boolean(latestAttempt?.correctSlots[index] && latestAttempt.words[index] === word.text)
  ));
  const solved = attempts.some(attempt => attempt.solved);
  const failed = !solved && attempts.length >= puzzle.maxAttempts;
  const remainingAttempts = Math.max(0, puzzle.maxAttempts - attempts.length);

  function invokeSeal() {
    if (solved || failed) return;
    const attempt = evaluateSealAttempt(puzzle, words, crypto.randomUUID());
    const nextAttempts = [attempt, ...attempts];
    setAttempts(nextAttempts);

    if (attempt.solved) {
      setNotice('The incantation locks into place. The seal holds.');
      return;
    }

    if (nextAttempts.length >= puzzle.maxAttempts) {
      setNotice('The fractured magic lashes back. The GM chooses the consequence.');
      return;
    }

    setNotice(`${puzzle.maxAttempts - nextAttempts.length} invocation${puzzle.maxAttempts - nextAttempts.length === 1 ? '' : 's'} remain before backlash.`);
  }

  function resetPuzzle() {
    setWords(createSealWords(puzzle.brokenWords, `${puzzle.id}-${Date.now()}`));
    setAttempts([]);
    setNotice('The seal is fractured, but still listening.');
  }

  return (
    <div className="broken-seals-layout">
      <main className={`seal-workbench ${solved ? 'solved' : failed ? 'failed' : ''}`}>
        <section className="seal-inscription-panel">
          <div>
            <p>True incantation</p>
            <h2>{puzzle.targetPhrase}</h2>
          </div>
          <span className="seal-attempt-counter">{remainingAttempts} tries</span>
        </section>

        <section className="seal-status-band" aria-live="polite">
          {solved ? <ShieldCheck className="h-5 w-5" /> : failed ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
          <span>{notice}</span>
        </section>

        <section className="word-tray" aria-label="Current seal words">
          {words.map((word, index) => (
            <article
              key={word.id}
              className={`seal-word ${revealedSlots[index] ? 'correct' : ''} ${draggedId === word.id ? 'dragging' : ''}`}
              draggable={!solved && !failed}
              onDragStart={() => setDraggedId(word.id)}
              onDragEnd={() => setDraggedId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const fromIndex = words.findIndex(item => item.id === draggedId);
                setWords(current => moveSealWord(current, fromIndex, index));
                setDraggedId(null);
              }}
            >
              <span>{word.text}</span>
            </article>
          ))}
        </section>

        <div className="seal-target-row" aria-label="Target word positions">
          {targetWords.map((word, index) => (
            <span key={`${word}-${index}`} className={revealedSlots[index] ? 'filled' : ''}>
              {index + 1}
            </span>
          ))}
        </div>

        <div className="seal-actions">
          <button type="button" className="invoke-seal-button" disabled={solved || failed} onClick={invokeSeal}>
            <Sparkles className="h-4 w-4" /> Invoke
          </button>
          <button type="button" onClick={resetPuzzle}>
            <RotateCcw className="h-4 w-4" /> Reset
          </button>
        </div>
      </main>

      <aside className="seal-side-panel">
        <section>
          <h2>Broken Function</h2>
          <p className="broken-reading">{words.map(word => word.text).join(' ')}</p>
          <p className="seal-threat"><AlertTriangle className="h-4 w-4" /> {puzzle.threat}</p>
        </section>

        <section>
          <h2>Previous Tries</h2>
          {attempts.length === 0 ? (
            <p className="empty-history">No invocations yet.</p>
          ) : (
            <div className="attempt-list">
              {attempts.map((attempt, attemptIndex) => (
                <article key={attempt.id} className={attempt.solved ? 'attempt solved' : 'attempt'}>
                  <header>
                    <span>Try {attempts.length - attemptIndex}</span>
                    {attempt.solved ? <CheckCircle2 className="h-4 w-4" /> : <ChevronsRight className="h-4 w-4" />}
                  </header>
                  <div>
                    {attempt.words.map((word, wordIndex) => (
                      <span key={`${attempt.id}-${wordIndex}`} className={attempt.correctSlots[wordIndex] ? 'correct' : ''}>
                        {word}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}
