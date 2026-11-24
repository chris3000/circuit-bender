import { useEffect, useRef, useState } from 'react';
import { classById } from '@/classes';
import { SYLLABUS } from '@/classes/syllabus';
import { useClasses } from './ClassesContext';
import styles from './Classes.module.css';

/** The course, in the header: every class in order, the built ones ready to take. */
export function ClassesMenu() {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const { progress, open: current, start, resume } = useClasses();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={menu} className={styles.menu}>
      <button className={styles.menuButton} data-open={open || undefined} aria-expanded={open} aria-haspopup="true"
        title="Classes: learn to build circuits, from a light with a switch upwards" onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1 4.2 L6 1.8 L11 4.2 L6 6.6 Z" fill="currentColor" />
          <path d="M3 5.8 V8.4 Q6 10.4 9 8.4 V5.8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        Classes
      </button>

      {open && (
        <div className={styles.dropdown} role="menu" aria-label="Classes">
          <div className={styles.dropdownTitle}>CLASSES</div>
          <p className={styles.dropdownIntro}>From a light with a switch to an instrument of your own. No experience needed.</p>
          {SYLLABUS.map((unit, index) => (
            <div key={unit.title} className={styles.unit}>
              <div className={styles.unitTitle}>UNIT {index + 1} · {unit.title.toUpperCase()}</div>
              {unit.classes.map((entry) => {
                const definition = classById(entry.id);
                const record = definition ? progress.classes[definition.id] : undefined;
                const begun = record !== undefined && (record.done.length > 0 || record.finished);
                const status = !definition ? 'SOON' : record?.finished ? 'DONE' : current?.id === definition.id ? 'OPEN' : begun ? 'CONTINUE' : 'START';
                return (
                  <button key={entry.number} role="menuitem" className={styles.entry} disabled={!definition}
                    data-testid={`class-${entry.number}`}
                    onClick={() => {
                      if (!definition) return;
                      if (begun) resume(definition); else start(definition);
                      setOpen(false);
                    }}>
                    <span className={styles.entryNumber}>{entry.number}</span>
                    <span className={styles.entryText}>
                      <span className={styles.entryTitle}>{entry.title}</span>
                      <span className={styles.entryBuilds}>{entry.builds}</span>
                    </span>
                    <span className={styles.entryStatus} data-status={status}>{status}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
