import '@testing-library/jest-dom';

// Mock Web Audio API for test environment
class MockAudioContext {
  state: AudioContextState = 'suspended';
  sampleRate = 44100;

  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime: () => {} },
      connect: () => {},
      disconnect: () => {},
    };
  }
  createOscillator() {
    return {
      frequency: { value: 440, setValueAtTime: () => {} },
      type: 'sine',
      connect: () => {},
      disconnect: () => {},
      start: () => {},
      stop: () => {},
    };
  }
  get destination() {
    return {};
  }
}

class MockAudioWorkletNode {
  port = {
    postMessage: () => {},
    onmessage: null,
  };
  connect() {}
  disconnect() {}
}

if (typeof globalThis.AudioContext === 'undefined') {
  (globalThis as any).AudioContext = MockAudioContext;
}
if (typeof globalThis.AudioWorkletNode === 'undefined') {
  (globalThis as any).AudioWorkletNode = MockAudioWorkletNode;
}

// Storage for tests: a plain one kept in memory, the same whatever runs them.
// (Newer Node versions have a `localStorage` of their own that shadows the
// test environment's and, with no file behind it, has none of the methods.)
class MemoryStorage {
  private items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });
