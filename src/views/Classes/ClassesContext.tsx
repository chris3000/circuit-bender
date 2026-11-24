import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { useReplaceCircuit } from '@/views/ReplaceGuard';
import { Circuit } from '@/models/Circuit';
import { classById, classCircuitName } from '@/classes';
import type { ClassDefinition } from '@/classes/types';
import { NEW_CLASS, readProgress, writeProgress, type ClassProgress, type Progress } from '@/classes/progress';

export interface ClassesValue {
  progress: Progress;
  /** The class in the panel, if one is. */
  open: ClassDefinition | undefined;
  /** Begin a class from the beginning, on an empty canvas (unsaved work is asked about first). */
  start: (definition: ClassDefinition) => void;
  /** Open the panel on a class that was begun before, where it was left. */
  resume: (definition: ClassDefinition) => void;
  /** Put the panel away. The class stays where it is. */
  close: () => void;
  update: (id: string, change: (progress: ClassProgress) => ClassProgress) => void;
}

const ClassesContext = createContext<ClassesValue>({
  progress: { open: null, classes: {} }, open: undefined,
  start: () => {}, resume: () => {}, close: () => {}, update: () => {},
});

export const useClasses = () => useContext(ClassesContext);

/** Which class is open and how far each has got, remembered in this browser. */
export function ClassesProvider({ children }: { children: ReactNode }) {
  const { circuit } = useCircuit();
  const replaceCircuit = useReplaceCircuit();
  const [progress, setProgress] = useState<Progress>(readProgress);
  useEffect(() => writeProgress(progress), [progress]);

  // A class begins once its empty canvas is there: the person may be asked
  // about unsaved work first, and may say no
  const waiting = useRef<{ classId: string; circuitId: string } | null>(null);
  const start = useCallback((definition: ClassDefinition) => {
    const fresh = new Circuit(classCircuitName(definition));
    waiting.current = { classId: definition.id, circuitId: fresh.id };
    replaceCircuit(fresh);
  }, [replaceCircuit]);
  useEffect(() => {
    const begun = waiting.current;
    if (!begun || begun.circuitId !== circuit.id) return;
    waiting.current = null;
    setProgress((p) => ({ open: begun.classId, classes: { ...p.classes, [begun.classId]: { ...NEW_CLASS } } }));
  }, [circuit]);

  const resume = useCallback((definition: ClassDefinition) => {
    setProgress((p) => ({ open: definition.id, classes: { ...p.classes, [definition.id]: p.classes[definition.id] ?? { ...NEW_CLASS } } }));
  }, []);
  const close = useCallback(() => setProgress((p) => ({ ...p, open: null })), []);
  const update = useCallback((id: string, change: (progress: ClassProgress) => ClassProgress) => {
    setProgress((p) => ({ ...p, classes: { ...p.classes, [id]: change(p.classes[id] ?? { ...NEW_CLASS }) } }));
  }, []);

  const value = useMemo<ClassesValue>(
    () => ({ progress, open: classById(progress.open), start, resume, close, update }),
    [progress, start, resume, close, update],
  );
  return <ClassesContext.Provider value={value}>{children}</ClassesContext.Provider>;
}
