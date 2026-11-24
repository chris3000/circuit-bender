import React, { createContext, useContext, useCallback, useMemo, useReducer } from 'react';
import { Circuit } from '@/models/Circuit';
import { wireNets } from '@/utils/wireColors';
import type {
  Component,
  Connection,
  ComponentId,
  ConnectionId,
  Position2D,
} from '@/types/circuit';

export interface UpdateOptions {
  /**
   * Whether the change is a step of its own for undo (default true). A knob
   * being turned records the first movement and not the hundred after it.
   */
  record?: boolean;
}

export interface ComponentMove {
  componentId: ComponentId;
  position: Position2D;
}

const MAX_UNDO_STACK_SIZE = 50;

interface CircuitContextType {
  circuit: Circuit;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: ComponentId) => void;
  updateComponent: (componentId: ComponentId, updates: Partial<Component>, options?: UpdateOptions) => void;
  /** Move several parts as one undo step. */
  moveComponents: (moves: ComponentMove[]) => void;
  /** Parts and the wires that go with them, as one undo step. */
  addParts: (components: Component[], connections: Connection[]) => void;
  /**
   * Any change that takes several steps (a part dropped into a wire, a part
   * swapped for another), as one undo step: `edit` is given the circuit and
   * returns the next one. Returning the same circuit changes nothing.
   */
  editCircuit: (edit: (circuit: Circuit) => Circuit) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: ConnectionId) => void;
  updateConnection: (connectionId: ConnectionId, updates: Partial<Connection>) => void;
  /** Color the given wires and everything they are joined to (undefined: back to the default). One undo step. */
  setWireColor: (connectionIds: ConnectionId[], color: string | undefined) => void;
  /** Replace the whole circuit (and its undo history). `dirty` marks it as not saved anywhere yet. */
  loadCircuit: (circuit: Circuit, options?: { dirty?: boolean }) => void;
  /** Whether the circuit has changes that are not in its saved copy (or its example). */
  isDirty: boolean;
  /** The circuit was just saved as `saved` (the same circuit, perhaps under a new name). */
  markSaved: (saved: Circuit) => void;
  selectedComponents: ComponentId[];
  selectedConnections: ConnectionId[];
  setSelection: (components: ComponentId[], connections: ConnectionId[]) => void;
  clearSelection: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const CircuitContext = createContext<CircuitContextType | undefined>(undefined);

interface CircuitState {
  circuit: Circuit;
  /** The circuit as last saved or loaded; null when what is on screen was never saved. */
  cleanCircuit: Circuit | null;
  undoStack: Circuit[];
  redoStack: Circuit[];
  selectedComponents: ComponentId[];
  selectedConnections: ConnectionId[];
}

type CircuitAction =
  | { type: 'ADD_COMPONENT'; component: Component }
  | { type: 'REMOVE_COMPONENT'; componentId: ComponentId }
  | { type: 'UPDATE_COMPONENT'; componentId: ComponentId; updates: Partial<Component>; record: boolean }
  | { type: 'MOVE_COMPONENTS'; moves: ComponentMove[] }
  | { type: 'ADD_PARTS'; components: Component[]; connections: Connection[] }
  | { type: 'EDIT'; edit: (circuit: Circuit) => Circuit }
  | { type: 'ADD_CONNECTION'; connection: Connection }
  | { type: 'REMOVE_CONNECTION'; connectionId: ConnectionId }
  | { type: 'UPDATE_CONNECTION'; connectionId: ConnectionId; updates: Partial<Connection> }
  | { type: 'SET_WIRE_COLOR'; connectionIds: ConnectionId[]; color: string | undefined }
  | { type: 'LOAD_CIRCUIT'; circuit: Circuit; dirty: boolean }
  | { type: 'MARK_SAVED'; circuit: Circuit }
  | { type: 'SET_SELECTION'; components: ComponentId[]; connections: ConnectionId[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

function pushUndoStack(undoStack: Circuit[], current: Circuit): Circuit[] {
  const next = [...undoStack, current];
  if (next.length > MAX_UNDO_STACK_SIZE) {
    return next.slice(next.length - MAX_UNDO_STACK_SIZE);
  }
  return next;
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

function circuitReducer(state: CircuitState, action: CircuitAction): CircuitState {
  switch (action.type) {
    case 'ADD_COMPONENT':
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit: state.circuit.addComponent(action.component),
      };
    case 'REMOVE_COMPONENT':
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit: state.circuit.removeComponent(action.componentId),
      };
    case 'UPDATE_COMPONENT':
      if (!state.circuit.getComponent(action.componentId)) return state;
      return {
        ...state,
        undoStack: action.record ? pushUndoStack(state.undoStack, state.circuit) : state.undoStack,
        redoStack: action.record ? [] : state.redoStack,
        circuit: state.circuit.updateComponent(action.componentId, action.updates),
      };
    case 'MOVE_COMPONENTS': {
      let circuit = state.circuit;
      for (const move of action.moves) {
        const component = circuit.getComponent(move.componentId);
        if (!component) continue;
        if (component.position.x === move.position.x && component.position.y === move.position.y) continue;
        circuit = circuit.updateComponent(move.componentId, { position: { ...move.position } });
      }
      if (circuit === state.circuit) return state;
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit,
      };
    }
    case 'ADD_PARTS': {
      let circuit = state.circuit;
      for (const component of action.components) circuit = circuit.addComponent(component);
      for (const connection of action.connections) circuit = circuit.addConnection(connection);
      if (circuit === state.circuit) return state;
      return { ...state, undoStack: pushUndoStack(state.undoStack, state.circuit), redoStack: [], circuit };
    }
    case 'EDIT': {
      const circuit = action.edit(state.circuit);
      if (circuit === state.circuit) return state;
      return { ...state, undoStack: pushUndoStack(state.undoStack, state.circuit), redoStack: [], circuit };
    }
    case 'ADD_CONNECTION':
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit: state.circuit.addConnection(action.connection),
      };
    case 'REMOVE_CONNECTION':
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit: state.circuit.removeConnection(action.connectionId),
      };
    case 'UPDATE_CONNECTION':
      return {
        ...state,
        circuit: state.circuit.updateConnection(action.connectionId, action.updates),
      };
    case 'SET_WIRE_COLOR': {
      const connections = state.circuit.getConnections();
      const nets = wireNets(connections);
      const chosen = new Set(action.connectionIds.map((id) => nets.get(id)));
      let circuit = state.circuit;
      for (const c of connections) {
        if (!chosen.has(nets.get(c.id)) || c.color === action.color) continue;
        circuit = circuit.updateConnection(c.id, { color: action.color });
      }
      if (circuit === state.circuit) return state;
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit,
      };
    }
    case 'UNDO': {
      if (state.undoStack.length === 0) return state;
      const newUndoStack = [...state.undoStack];
      const restored = newUndoStack.pop()!;
      return {
        ...state,
        undoStack: newUndoStack,
        redoStack: [...state.redoStack, state.circuit],
        circuit: restored,
      };
    }
    case 'REDO': {
      if (state.redoStack.length === 0) return state;
      const newRedoStack = [...state.redoStack];
      const restored = newRedoStack.pop()!;
      return {
        ...state,
        redoStack: newRedoStack,
        undoStack: [...state.undoStack, state.circuit],
        circuit: restored,
      };
    }
    case 'LOAD_CIRCUIT':
      return {
        ...state,
        circuit: action.circuit,
        cleanCircuit: action.dirty ? null : action.circuit,
        undoStack: [],
        redoStack: [],
      };
    case 'MARK_SAVED': {
      // Saving can rename the circuit. The history keeps its steps, under the new name
      const name = action.circuit.name;
      return {
        ...state,
        circuit: action.circuit,
        cleanCircuit: action.circuit,
        undoStack: state.undoStack.map((c) => c.withName(name)),
        redoStack: state.redoStack.map((c) => c.withName(name)),
      };
    }
    case 'SET_SELECTION':
      if (sameIds(state.selectedComponents, action.components) && sameIds(state.selectedConnections, action.connections)) return state;
      return {
        ...state,
        selectedComponents: action.components,
        selectedConnections: action.connections,
      };
    case 'CLEAR_SELECTION':
      if (state.selectedComponents.length === 0 && state.selectedConnections.length === 0) return state;
      return {
        ...state,
        selectedComponents: [],
        selectedConnections: [],
      };
  }
}

/** What to start with instead of an empty circuit (work restored from the last visit). */
export interface InitialCircuit {
  circuit: Circuit;
  dirty: boolean;
}

function createInitialState(initial?: InitialCircuit | null): CircuitState {
  const circuit = initial?.circuit ?? new Circuit('Untitled Circuit');
  return {
    circuit,
    cleanCircuit: initial?.dirty ? null : circuit,
    undoStack: [],
    redoStack: [],
    selectedComponents: [],
    selectedConnections: [],
  };
}

export function CircuitProvider({ children, initial }: { children: React.ReactNode; initial?: InitialCircuit | null }) {
  const [state, dispatch] = useReducer(circuitReducer, initial, createInitialState);

  const addComponent = useCallback((component: Component) => {
    dispatch({ type: 'ADD_COMPONENT', component });
  }, []);

  const removeComponent = useCallback((componentId: ComponentId) => {
    dispatch({ type: 'REMOVE_COMPONENT', componentId });
  }, []);

  const updateComponent = useCallback(
    (componentId: ComponentId, updates: Partial<Component>, options?: UpdateOptions) => {
      dispatch({ type: 'UPDATE_COMPONENT', componentId, updates, record: options?.record !== false });
    },
    []
  );

  const moveComponents = useCallback((moves: ComponentMove[]) => {
    dispatch({ type: 'MOVE_COMPONENTS', moves });
  }, []);

  const addParts = useCallback((components: Component[], connections: Connection[]) => {
    dispatch({ type: 'ADD_PARTS', components, connections });
  }, []);

  const editCircuit = useCallback((edit: (circuit: Circuit) => Circuit) => {
    dispatch({ type: 'EDIT', edit });
  }, []);

  const addConnection = useCallback((connection: Connection) => {
    dispatch({ type: 'ADD_CONNECTION', connection });
  }, []);

  const removeConnection = useCallback((connectionId: ConnectionId) => {
    dispatch({ type: 'REMOVE_CONNECTION', connectionId });
  }, []);

  const updateConnection = useCallback(
    (connectionId: ConnectionId, updates: Partial<Connection>) => {
      dispatch({ type: 'UPDATE_CONNECTION', connectionId, updates });
    },
    []
  );

  const setWireColor = useCallback((connectionIds: ConnectionId[], color: string | undefined) => {
    dispatch({ type: 'SET_WIRE_COLOR', connectionIds, color });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const loadCircuit = useCallback((newCircuit: Circuit, options?: { dirty?: boolean }) => {
    dispatch({ type: 'LOAD_CIRCUIT', circuit: newCircuit, dirty: options?.dirty === true });
  }, []);

  const markSaved = useCallback((saved: Circuit) => {
    dispatch({ type: 'MARK_SAVED', circuit: saved });
  }, []);

  const setSelection = useCallback((components: ComponentId[], connections: ConnectionId[]) => {
    dispatch({ type: 'SET_SELECTION', components, connections });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  const value = useMemo<CircuitContextType>(() => ({
    circuit: state.circuit,
    addComponent,
    removeComponent,
    updateComponent,
    moveComponents,
    addParts,
    editCircuit,
    addConnection,
    removeConnection,
    updateConnection,
    setWireColor,
    loadCircuit,
    isDirty: state.circuit !== state.cleanCircuit,
    markSaved,
    selectedComponents: state.selectedComponents,
    selectedConnections: state.selectedConnections,
    setSelection,
    clearSelection,
    undo,
    redo,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
  }), [state, addComponent, removeComponent, updateComponent, moveComponents, addParts, editCircuit, addConnection, removeConnection, updateConnection, setWireColor, loadCircuit, markSaved, setSelection, clearSelection, undo, redo]);

  return (
    <CircuitContext.Provider value={value}>{children}</CircuitContext.Provider>
  );
}

export function useCircuit(): CircuitContextType {
  const context = useContext(CircuitContext);
  if (!context) {
    throw new Error('useCircuit must be used within CircuitProvider');
  }
  return context;
}
