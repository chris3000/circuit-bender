import { useEffect, useMemo, useRef, useState } from 'react';
import type { Circuit } from '@/models/Circuit';
import { useCircuit } from '@/context/CircuitContext';
import { useReplaceCircuit } from '@/views/ReplaceGuard';
import { classById, classStage } from '@/classes';
import { SYLLABUS } from '@/classes/syllabus';
import { SECTIONS, type ClassDefinition, type Experiment, type Step } from '@/classes/types';
import { Work, type Situation } from '@/classes/Work';
import type { ClassProgress } from '@/classes/progress';
import type { ActiveView } from '@/views/viewModes';
import { useClasses } from './ClassesContext';
import styles from './Classes.module.css';

interface ClassPanelProps {
  /** Whether the circuit is running, and which view is showing: steps ask. */
  playing: boolean;
  view: ActiveView;
  /** The pins the scope has probes on. */
  probes?: Situation['probes'];
  /** The sound is close to breaking up. */
  strained?: boolean;
  /** The jumper the bend tool is holding, while it holds one. */
  bend?: Situation['bend'];
}

/** A question asked of a half-built circuit must never take the panel down with it. */
function ask<T>(question: () => T, otherwise: T): T {
  try { return question(); } catch { return otherwise; }
}

/**
 * The class being taken, beside the canvas: what to build, why it works,
 * what to try, the check that finishes it, and what to keep. It watches the
 * learner's own circuit and ticks things off as they are done.
 */
export function ClassPanel({ playing, view, probes, strained, bend }: ClassPanelProps) {
  const { open: definition, progress, update, close, start } = useClasses();
  const { circuit: latest, adjusting, isDirty, selectedComponents, selectedConnections } = useCircuit();
  const circuit = useSettled(latest, adjusting);
  const replaceCircuit = useReplaceCircuit();

  const situation = useMemo<Situation>(
    () => ({ playing, saved: !isDirty, view, selected: selectedComponents, wires: selectedConnections, probes, strained, bend }),
    [playing, isDirty, view, selectedComponents, selectedConnections, probes, strained, bend],
  );
  const work = useMemo(() => new Work(circuit, situation), [circuit, situation]);
  const record = definition ? progress.classes[definition.id] : undefined;

  // Whatever the circuit shows to be done now is done for good
  useEffect(() => {
    if (!definition || !record) return;
    const steps = [...definition.build, ...definition.keep]
      .filter((step) => !record.done.includes(step.id) && ask(() => step.done(work), false))
      .map((step) => step.id);
    // An experiment shows its result once it has been guessed at and then made
    const results: Record<string, string> = {};
    for (const experiment of definition.tries) {
      if (record.guesses[experiment.id] === undefined || record.results[experiment.id] !== undefined) continue;
      if (ask(() => experiment.made(work), false)) results[experiment.id] = ask(() => experiment.result(work), '');
    }
    // The check counts while it is the thing being worked on
    const finished = !record.finished && SECTIONS[record.section]?.id === 'check' && ask(() => definition.check.passed(work), false);
    if (steps.length === 0 && Object.keys(results).length === 0 && !finished) return;
    update(definition.id, (p) => ({
      ...p,
      done: [...p.done, ...steps.filter((id) => !p.done.includes(id))],
      results: { ...p.results, ...results },
      finished: p.finished || finished,
    }));
  }, [definition, record, work, update]);

  if (!definition || !record) return null;

  const section = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, record.section))];
  const go = (index: number) => update(definition.id, (p) => ({ ...p, section: Math.max(0, Math.min(SECTIONS.length - 1, index)) }));
  const allDone = (steps: Step[]) => steps.every((step) => record.done.includes(step.id));
  const complete: Record<string, boolean> = {
    build: allDone(definition.build),
    try: definition.tries.every((t) => record.results[t.id] !== undefined),
    check: record.finished,
    keep: allDone(definition.keep),
  };

  return (
    <aside className={styles.panel} aria-label={`Class ${definition.number}: ${definition.title}`} data-testid="class-panel"
      // What is typed or pressed here is not a canvas shortcut
      onKeyDown={(e) => e.stopPropagation()}>
      <header className={styles.head}>
        <div className={styles.eyebrow}>
          <span>CLASS {definition.number} · {definition.unit.toUpperCase()}</span>
          <button className={styles.close} onClick={close} aria-label="Close the class" title="Put the class away. It stays where you left it.">×</button>
        </div>
        <h2 className={styles.title}>{definition.title}</h2>
        <p className={styles.promise}>{definition.promise}</p>
      </header>

      <nav className={styles.tabs} aria-label="Parts of the class">
        {SECTIONS.map((s, index) => (
          <button key={s.id} className={styles.tab} aria-current={s.id === section.id ? 'step' : undefined}
            data-done={complete[s.id] || undefined} data-testid={`class-tab-${s.id}`} onClick={() => go(index)}>
            {s.label}{complete[s.id] && <span className={styles.tabTick} aria-label="done"> ✓</span>}
          </button>
        ))}
      </nav>

      <div className={styles.body} data-testid={`class-section-${section.id}`}>
        <h3 className={styles.sectionTitle}>{section.title}</h3>

        {section.id === 'build' && (
          <>
            <p className={styles.note}>Starts from: {definition.startsFrom}</p>
            <Steps steps={definition.build} done={record.done} />
            {complete.build
              ? <p className={styles.result}>It works. Now for why.</p>
              : (
                <button className={styles.link} onClick={() => replaceCircuit(classStage(definition, record.done), { unsaved: true })}>
                  {definition.stages
                    ? 'Stuck? Put this part of the build on the canvas, finished.'
                    : 'Stuck? Put the finished circuit on the canvas.'}
                </button>
              )}
          </>
        )}

        {section.id === 'why' && definition.why.map((paragraph) => (
          <p key={paragraph.title} className={styles.paragraph}>
            <strong className={styles.lead}>{paragraph.title}.</strong> {paragraph.text}
          </p>
        ))}

        {section.id === 'try' && (
          <>
            <p className={styles.note}>Guess first, then make the change and see. A wrong guess put right is what this part is for.</p>
            {definition.tries.map((experiment, index) => (
              <Trial key={experiment.id} number={index + 1} experiment={experiment} record={record}
                onGuess={(option) => update(definition.id, (p) => ({ ...p, guesses: { ...p.guesses, [experiment.id]: option } }))} />
            ))}
          </>
        )}

        {section.id === 'check' && (
          <>
            <p className={styles.paragraph}>{definition.check.goal}</p>
            <div className={styles.reading} data-passed={record.finished || undefined} data-testid="class-reading">
              {ask(() => definition.check.reading(work), null) ?? 'Nothing to measure yet.'}
            </div>
            {record.finished ? (
              <p className={styles.result} data-testid="class-finished">
                <strong>That is it: class {definition.number} is done.</strong> The app measured your own circuit to say so. Next, keep it.
              </p>
            ) : record.hinted ? (
              <p className={styles.hint}>{definition.check.hint}</p>
            ) : (
              <button className={styles.link} onClick={() => update(definition.id, (p) => ({ ...p, hinted: true }))}>Show a hint</button>
            )}
          </>
        )}

        {section.id === 'keep' && (
          <>
            <Steps steps={definition.keep} done={record.done} />
            {complete.keep && <p className={styles.result}>Kept. {nextClass(definition)}</p>}
          </>
        )}

        {section.id === 'words' && (
          <dl className={styles.words}>
            {definition.words.map(({ word, meaning }) => (
              <div key={word}><dt>{word}</dt><dd>{meaning}</dd></div>
            ))}
          </dl>
        )}
      </div>

      <footer className={styles.foot}>
        {record.section > 0
          ? <button className={styles.step} onClick={() => go(record.section - 1)}>← {SECTIONS[record.section - 1].label}</button>
          : <button className={styles.step} onClick={() => start(definition)} title="Put the canvas back as this class starts and begin again">Start over</button>}
        {record.section < SECTIONS.length - 1 && (
          <button className={`${styles.step} ${styles.next}`} data-testid="class-next" onClick={() => go(record.section + 1)}>
            {SECTIONS[record.section + 1].label} →
          </button>
        )}
      </footer>
    </aside>
  );
}

/** How long a control has to rest before the panel looks at the circuit again. */
const SETTLE_MS = 200;

/**
 * The circuit the panel measures. Measuring can take a tenth of a second,
 * and a knob being turned makes a new circuit with every movement, so while
 * a control is being worked the panel looks at once when the working begins
 * (a button pressed is seen while it is held) and then not again until the
 * control has rested a moment. Every other edit is looked at as it is made.
 */
function useSettled(circuit: Circuit, adjusting: boolean): Circuit {
  const [seen, setSeen] = useState(circuit);
  const changed = useRef(0);
  useEffect(() => {
    if (!adjusting) {
      setSeen(circuit); // kept in step, so that nothing old is looked at when the next control is worked
      return undefined;
    }
    const quiet = performance.now() - changed.current >= SETTLE_MS;
    changed.current = performance.now();
    if (quiet) {
      setSeen(circuit);
      return undefined;
    }
    const timer = setTimeout(() => setSeen(circuit), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [circuit, adjusting]);
  return adjusting ? seen : circuit;
}

/** What comes after a class, in a sentence. */
function nextClass(definition: ClassDefinition): string {
  const all = SYLLABUS.flatMap((unit) => unit.classes);
  const next = all.find((entry) => entry.number === definition.number + 1);
  if (!next) return 'That was the last class.';
  return classById(next.id)
    ? `Class ${next.number}, ${next.title}, is next: it is in the Classes menu.`
    : `Class ${next.number}, ${next.title}, comes next. It is not built yet.`;
}

/** A list of steps: the ones done are ticked, the next one says how. */
function Steps({ steps, done }: { steps: Step[]; done: string[] }) {
  const next = steps.find((step) => !done.includes(step.id));
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <ol className={styles.steps}>
      {steps.map((step, index) => {
        const isDone = done.includes(step.id);
        const showHow = step.how && (step.id === next?.id || step.id === opened);
        return (
          <li key={step.id} className={styles.stepItem} data-done={isDone || undefined} data-next={step.id === next?.id || undefined}
            data-testid={`class-step-${step.id}`}>
            <span className={styles.marker} aria-hidden="true">{isDone ? '✓' : index + 1}</span>
            <div>
              <button className={styles.stepText} disabled={!step.how} aria-expanded={step.how ? Boolean(showHow) : undefined}
                onClick={() => setOpened((id) => (id === step.id ? null : step.id))}>
                {step.text}{isDone && <span className={styles.srOnly}> (done)</span>}
              </button>
              {showHow && <p className={styles.how}>{step.how}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One experiment: the guess, then the change, then what it showed. */
function Trial({ number, experiment, record, onGuess }: {
  number: number; experiment: Experiment; record: ClassProgress; onGuess: (option: number) => void;
}) {
  const guess = record.guesses[experiment.id];
  const result = record.results[experiment.id];
  return (
    <section className={styles.trial} data-testid={`class-try-${experiment.id}`} data-shown={result !== undefined || undefined}>
      <h4 className={styles.trialTitle}><span>{number}</span>{experiment.title}</h4>
      <p className={styles.question}>{experiment.question}</p>
      <div className={styles.options} role="group" aria-label="Your guess">
        {experiment.options.map((option, index) => (
          <button key={option} className={styles.option} aria-pressed={guess === index}
            data-right={result !== undefined && index === experiment.answer ? true : undefined}
            disabled={result !== undefined} onClick={() => onGuess(index)}>
            {option}
          </button>
        ))}
      </div>
      {guess === undefined && <p className={styles.waiting}>Pick one before you try it.</p>}
      {guess !== undefined && result === undefined && (
        <>
          <p className={styles.change}><strong>Now try it.</strong> {experiment.change}</p>
          <p className={styles.waiting}>The answer shows here when the change is on the canvas.</p>
        </>
      )}
      {result !== undefined && (
        <p className={styles.result}>
          <strong>{guess === experiment.answer ? 'As you guessed.' : 'Not what you guessed.'}</strong> {result}
        </p>
      )}
    </section>
  );
}
