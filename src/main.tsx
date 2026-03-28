import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { resistorDefinition } from './components/definitions/Resistor';
import { capacitorDefinition } from './components/definitions/Capacitor';
import { cd40106Definition } from './components/definitions/CD40106';
import { lm741Definition } from './components/definitions/LM741';
import './styles/globals.css';

// Initialize component registry
const registry = ComponentRegistry.getInstance();
registry.register(resistorDefinition);
registry.register(capacitorDefinition);
registry.register(cd40106Definition);
registry.register(lm741Definition);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
