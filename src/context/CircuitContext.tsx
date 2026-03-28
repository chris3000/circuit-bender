import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';
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

export function CircuitProvider({ children }: { children: React.ReactNode }) {
  const [circuit, setCircuit] = useState<Circuit>(() => new Circuit('Untitled Circuit'));
  const [undoStack, setUndoStack] = useState<Circuit[]>([]);
  const [redoStack, setRedoStack] = useState<Circuit[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<ComponentId[]>([]);
  const [selectedConnections, setSelectedConnections] = useState<ConnectionId[]>([]);

  // Use a ref to always have the current circuit available for undo/redo stack pushes
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;

  const pushUndo = useCallback(() => {
    setUndoStack((prev) => {
      const next = [...prev, circuitRef.current];
      if (next.length > MAX_UNDO_STACK_SIZE) {
        return next.slice(next.length - MAX_UNDO_STACK_SIZE);
      }
      return next;
    });
    setRedoStack([]);
  }, []);

  const addComponent = useCallback((component: Component) => {
    pushUndo();
    setCircuit((prev) => prev.addComponent(component));
  }, [pushUndo]);

  const removeComponent = useCallback((componentId: ComponentId) => {
    pushUndo();
    setCircuit((prev) => prev.removeComponent(componentId));
  }, [pushUndo]);

  const updateComponent = useCallback(
    (componentId: ComponentId, updates: Partial<Component>) => {
      pushUndo();
      setCircuit((prev) => prev.updateComponent(componentId, updates));
    },
    [pushUndo]
  );

  const addConnection = useCallback((connection: Connection) => {
    pushUndo();
    setCircuit((prev) => prev.addConnection(connection));
  }, [pushUndo]);

  const removeConnection = useCallback((connectionId: ConnectionId) => {
    pushUndo();
    setCircuit((prev) => prev.removeConnection(connectionId));
  }, [pushUndo]);

  const undo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const newStack = [...prev];
      const restored = newStack.pop()!;
      setRedoStack((redoPrev) => [...redoPrev, circuitRef.current]);
      setCircuit(restored);
      return newStack;
    });
  }, []);

  const redo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const newStack = [...prev];
      const restored = newStack.pop()!;
      setUndoStack((undoPrev) => [...undoPrev, circuitRef.current]);
      setCircuit(restored);
      return newStack;
    });
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const loadCircuit = useCallback((newCircuit: Circuit) => {
    resetBreadboardGrid();
    setCircuit(newCircuit);
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  const setSelection = useCallback((components: ComponentId[], connections: ConnectionId[]) => {
    setSelectedComponents(components);
    setSelectedConnections(connections);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedComponents([]);
    setSelectedConnections([]);
  }, []);

  const value = useMemo<CircuitContextType>(() => ({
    circuit,
    addComponent,
    removeComponent,
    updateComponent,
    addConnection,
    removeConnection,
    loadCircuit,
    selectedComponents,
    selectedConnections,
    setSelection,
    clearSelection,
    undo,
    redo,
    canUndo,
    canRedo,
  }), [circuit, addComponent, removeComponent, updateComponent, addConnection, removeConnection, loadCircuit, selectedComponents, selectedConnections, setSelection, clearSelection, undo, redo, canUndo, canRedo]);

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
