import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import { partExampleCircuit, partExampleFor, type ChosenExample } from '@/examples/parts';
import type { ComponentDefinition, ComponentId, ComponentParameters } from '@/types/circuit';
import { useReplaceCircuit } from '@/views/ReplaceGuard';

/** A part being asked about: what it is, and where on the screen the asking was done. */
export interface PartAsked {
  definition: ComponentDefinition;
  parameters: ComponentParameters;
  /** The card goes beside this: the right edge, the left edge and the middle of whatever was clicked. */
  at: { x: number; left: number; y: number };
}

/** The example that is on the canvas now, for the note that stays with it. */
export interface OpenExample {
  name: string;
  description: string;
}

interface PartExamples {
  /** The part whose card is showing, if one is. */
  asked: PartAsked | null;
  /** Show a part's card (again for the same part puts it away). */
  ask: (part: PartAsked) => void;
  dismiss: () => void;
  /** Put a part's example on the canvas, in place of what is there (asking first if that is unsaved). */
  open: (chosen: ChosenExample) => void;
  /** The example on the canvas, until its note is closed or another circuit takes its place. */
  note: OpenExample | null;
  closeNote: () => void;
}

const IDLE: PartExamples = { asked: null, ask: () => {}, dismiss: () => {}, open: () => {}, note: null, closeNote: () => {} };

const PartExamplesContext = createContext<PartExamples>(IDLE);

/** What each part does: the card that says so, and the example that shows it. */
export function usePartExamples(): PartExamples {
  return useContext(PartExamplesContext);
}

/** The example of a part as it stands in a circuit or lies on the shelf; null if it has none. */
export function useExampleOf(definition: ComponentDefinition | undefined, parameters: ComponentParameters): ChosenExample | null {
  const spec = definition?.value;
  const value = spec ? parameters[spec.parameter] : undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (definition ? partExampleFor(definition, parameters) : null), [definition, value]);
}

export function PartExamplesProvider({ children }: { children: React.ReactNode }) {
  const { circuit, setSelection } = useCircuit();
  const replaceCircuit = useReplaceCircuit();
  const [asked, setAsked] = useState<PartAsked | null>(null);
  const [opened, setOpened] = useState<(OpenExample & { circuitId: string; featured: ComponentId }) | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  const pointedAt = useRef<string | null>(null);

  const ask = useCallback((part: PartAsked) => {
    const same = (now: PartAsked) => now.definition === part.definition && now.at.left === part.at.left
      && JSON.stringify(now.parameters) === JSON.stringify(part.parameters);
    setAsked((now) => (now && same(now) ? null : part));
  }, []);
  const dismiss = useCallback(() => setAsked(null), []);

  const open = useCallback((chosen: ChosenExample) => {
    const { circuit: next, featured } = partExampleCircuit(chosen);
    setAsked(null);
    setOpened({ circuitId: next.id, featured, name: chosen.example.name, description: chosen.description });
    replaceCircuit(next);
  }, [replaceCircuit]);

  // Once the example is on the canvas (the person may have been asked about
  // unsaved work first), the part it is about is the one selected
  const arrived = opened !== null && circuit.id === opened.circuitId;
  useEffect(() => {
    if (!opened || !arrived || pointedAt.current === opened.circuitId) return;
    pointedAt.current = opened.circuitId;
    setSelection([opened.featured], []);
  }, [opened, arrived, setSelection]);

  const closeNote = useCallback(() => setClosed(opened?.circuitId ?? null), [opened]);
  const note = arrived && opened && closed !== opened.circuitId ? opened : null;

  const value = useMemo<PartExamples>(
    () => ({ asked, ask, dismiss, open, note, closeNote }),
    [asked, ask, dismiss, open, note, closeNote],
  );
  return <PartExamplesContext.Provider value={value}>{children}</PartExamplesContext.Provider>;
}
