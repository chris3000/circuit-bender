import React, { createContext, useContext, useCallback, useMemo, useReducer } from 'react';
import { Circuit } from '@/models/Circuit';
import { resetBreadboardGrid } from '@/utils/componentFactory';
import type {
  Component,
  Connection,
  ComponentId,
  ConnectionId,
} from '@/types/circuit';

const MAX_UNDO_STACK_SIZE = 50;

interface CircuitContextType {
  circuit: Circuit;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: ComponentId) => void;
  updateComponent: (componentId: ComponentId, updates: Partial<Component>) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: ConnectionId) => void;
  loadCircuit: (circuit: Circuit) => void;
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
  undoStack: Circuit[];
  redoStack: Circuit[];
  selectedComponents: ComponentId[];
  selectedConnections: ConnectionId[];
}

type CircuitAction =
  | { type: 'ADD_COMPONENT'; component: Component }
  | { type: 'REMOVE_COMPONENT'; componentId: ComponentId }
  | { type: 'UPDATE_COMPONENT'; componentId: ComponentId; updates: Partial<Component> }
  | { type: 'ADD_CONNECTION'; connection: Connection }
  | { type: 'REMOVE_CONNECTION'; connectionId: ConnectionId }
  | { type: 'LOAD_CIRCUIT'; circuit: Circuit }
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
      return {
        ...state,
        undoStack: pushUndoStack(state.undoStack, state.circuit),
        redoStack: [],
        circuit: state.circuit.updateComponent(action.componentId, action.updates),
      };
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
      resetBreadboardGrid();
      return {
        ...state,
        circuit: action.circuit,
        undoStack: [],
        redoStack: [],
      };
    case 'SET_SELECTION':
      return {
        ...state,
        selectedComponents: action.components,
        selectedConnections: action.connections,
      };
    case 'CLEAR_SELECTION':
      return {
        ...state,
        selectedComponents: [],
        selectedConnections: [],
      };
  }
}

function createInitialState(): CircuitState {
  return {
    circuit: new Circuit('Untitled Circuit'),
    undoStack: [],
    redoStack: [],
    selectedComponents: [],
    selectedConnections: [],
  };
}

export function CircuitProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(circuitReducer, undefined, createInitialState);

  const addComponent = useCallback((component: Component) => {
    dispatch({ type: 'ADD_COMPONENT', component });
  }, []);

  const removeComponent = useCallback((componentId: ComponentId) => {
    dispatch({ type: 'REMOVE_COMPONENT', componentId });
  }, []);

  const updateComponent = useCallback(
    (componentId: ComponentId, updates: Partial<Component>) => {
      dispatch({ type: 'UPDATE_COMPONENT', componentId, updates });
    },
    []
  );

  const addConnection = useCallback((connection: Connection) => {
    dispatch({ type: 'ADD_CONNECTION', connection });
  }, []);

  const removeConnection = useCallback((connectionId: ConnectionId) => {
    dispatch({ type: 'REMOVE_CONNECTION', connectionId });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const loadCircuit = useCallback((newCircuit: Circuit) => {
    dispatch({ type: 'LOAD_CIRCUIT', circuit: newCircuit });
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
    addConnection,
    removeConnection,
    loadCircuit,
    selectedComponents: state.selectedComponents,
    selectedConnections: state.selectedConnections,
    setSelection,
    clearSelection,
    undo,
    redo,
    canUndo: state.undoStack.length > 0,
    canRedo: state.redoStack.length > 0,
  }), [state, addComponent, removeComponent, updateComponent, addConnection, removeConnection, loadCircuit, setSelection, clearSelection, undo, redo]);

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
