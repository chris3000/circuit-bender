import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ComponentRegistry } from './components/registry/ComponentRegistry';
import { resistorDefinition } from './components/definitions/Resistor';
import { capacitorDefinition } from './components/definitions/Capacitor';
import { cd40106Definition } from './components/definitions/CD40106';
import { lm741Definition } from './components/definitions/LM741';
import { potentiometerDefinition } from './components/definitions/Potentiometer';
import { powerSupplyDefinition } from './components/definitions/PowerSupply';
import { groundDefinition } from './components/definitions/Ground';
import { transistor2N3904Definition } from './components/definitions/Transistor2N3904';
import { diode1N914Definition } from './components/definitions/Diode1N914';
import { audioOutputJackDefinition } from './components/definitions/AudioOutputJack';
import { ledDefinition } from './components/definitions/LED';
import { SimulationEngine } from './simulation/SimulationEngine';
import './styles/globals.css';

// Initialize component registry
const registry = ComponentRegistry.getInstance();
registry.register(resistorDefinition);
registry.register(capacitorDefinition);
registry.register(cd40106Definition);
registry.register(lm741Definition);
registry.register(potentiometerDefinition);
registry.register(powerSupplyDefinition);
registry.register(groundDefinition);
registry.register(transistor2N3904Definition);
registry.register(diode1N914Definition);
registry.register(audioOutputJackDefinition);
registry.register(ledDefinition);

SimulationEngine.registerOutputType('audio-output');
SimulationEngine.registerOutputType('led');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
