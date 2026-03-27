import { CircuitProvider } from './context/CircuitContext';
import SchematicView from './views/SchematicView';

function App() {
  return (
    <CircuitProvider>
      <div className="app">
        <header className="app-header">
          <h1>Circuit Bender</h1>
        </header>
        <main className="app-main">
          <SchematicView />
        </main>
      </div>
    </CircuitProvider>
  );
}

export default App;
