import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { resistorDefinition } from './components/definitions/Resistor';
import { capacitorDefinition } from './components/definitions/Capacitor';
import './styles/globals.css';

// Initialize component registry
const registry = ComponentRegistry.getInstance();
registry.register(resistorDefinition);
registry.register(capacitorDefinition);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
