import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Circuit } from '@/models/Circuit';
import type {
  Component,
  Connection,
  ComponentId,
  ConnectionId,
} from '@/types/circuit';

interface CircuitContextType {
  circuit: Circuit;
  addComponent: (component: Component) => void;
  removeComponent: (componentId: ComponentId) => void;
  updateComponent: (componentId: ComponentId, updates: Partial<Component>) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: ConnectionId) => void;
  loadCircuit: (circuit: Circuit) => void;
}

const CircuitContext = createContext<CircuitContextType | undefined>(undefined);

export function CircuitProvider({ children }: { children: React.ReactNode }) {
  const [circuit, setCircuit] = useState<Circuit>(() => new Circuit('Untitled Circuit'));

  const addComponent = useCallback((component: Component) => {
    setCircuit((prev) => prev.addComponent(component));
  }, []);

  const removeComponent = useCallback((componentId: ComponentId) => {
    setCircuit((prev) => prev.removeComponent(componentId));
  }, []);

  const updateComponent = useCallback(
    (componentId: ComponentId, updates: Partial<Component>) => {
      setCircuit((prev) => prev.updateComponent(componentId, updates));
    },
    []
  );

  const addConnection = useCallback((connection: Connection) => {
    setCircuit((prev) => prev.addConnection(connection));
  }, []);

  const removeConnection = useCallback((connectionId: ConnectionId) => {
    setCircuit((prev) => prev.removeConnection(connectionId));
  }, []);

  const loadCircuit = useCallback((newCircuit: Circuit) => {
    setCircuit(newCircuit);
  }, []);

  const value = useMemo<CircuitContextType>(() => ({
    circuit,
    addComponent,
    removeComponent,
    updateComponent,
    addConnection,
    removeConnection,
    loadCircuit,
  }), [circuit, addComponent, removeComponent, updateComponent, addConnection, removeConnection, loadCircuit]);

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
