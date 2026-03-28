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
