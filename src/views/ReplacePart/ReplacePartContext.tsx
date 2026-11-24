import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useCircuit } from '@/context/CircuitContext';
import type { Component, ComponentDefinition, ComponentId, ComponentParameters } from '@/types/circuit';
import { fitsInPlaceOf, replacePart } from '@/utils/circuitEdits';
import { generateComponentId } from '@/utils/ids';

export interface ReplacePart {
  /** The part being swapped for another, if one is. */
  target: Component | null;
  /** Choosing from the whole parts shelf, not from the short list beside the part. */
  wide: boolean;
  /** Start swapping a part (double-click it, or the inspector's button). */
  begin: (id: ComponentId) => void;
  /** Go on to choosing from the whole shelf. */
  widen: () => void;
  cancel: () => void;
  /** Whether a part of this kind has a leg for each of the target's wires. */
  fits: (definition: ComponentDefinition) => boolean;
  /** Put a part of this kind, with these parameters, in the target's place. One undo step. */
  replaceWith: (definition: ComponentDefinition, parameters: ComponentParameters) => void;
}

const IDLE: ReplacePart = {
  target: null, wide: false,
  begin: () => {}, widen: () => {}, cancel: () => {}, fits: () => false, replaceWith: () => {},
};

const ReplacePartContext = createContext<ReplacePart>(IDLE);

/** Swapping a part: started on the canvas, finished there or on the parts shelf. */
export function useReplacePart(): ReplacePart {
  return useContext(ReplacePartContext);
}

export function ReplacePartProvider({ children }: { children: React.ReactNode }) {
  const { circuit, editCircuit, setSelection } = useCircuit();
  const [state, setState] = useState<{ id: ComponentId; wide: boolean } | null>(null);
  const target = state ? circuit.getComponent(state.id) ?? null : null;

  // The part went (deleted, undone away, another circuit opened): nothing to swap
  useEffect(() => {
    if (state && !target) setState(null);
  }, [state, target]);

  const begin = useCallback((id: ComponentId) => setState({ id, wide: false }), []);
  const widen = useCallback(() => setState((s) => (s ? { ...s, wide: true } : s)), []);
  const cancel = useCallback(() => setState(null), []);

  const fits = useCallback(
    (definition: ComponentDefinition) => (target ? fitsInPlaceOf(circuit, target.id, definition) : false),
    [circuit, target],
  );

  const replaceWith = useCallback((definition: ComponentDefinition, parameters: ComponentParameters) => {
    if (!target) return;
    setState(null);
    if (!fitsInPlaceOf(circuit, target.id, definition)) return;
    const id = target.id;
    // Made here, not in the edit, so that what is selected afterwards is known
    const newId = generateComponentId();
    editCircuit((c) => replacePart(c, id, definition, parameters, newId).circuit);
    setSelection([definition.type === target.type ? id : newId], []);
  }, [circuit, target, editCircuit, setSelection]);

  const value = useMemo<ReplacePart>(() => ({
    target: target && target.type !== 'junction' ? target : null,
    wide: state?.wide ?? false,
    begin, widen, cancel, fits, replaceWith,
  }), [target, state?.wide, begin, widen, cancel, fits, replaceWith]);

  return <ReplacePartContext.Provider value={value}>{children}</ReplacePartContext.Provider>;
}
