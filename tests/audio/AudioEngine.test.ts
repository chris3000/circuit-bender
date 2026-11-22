import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioEngine } from '@/audio/AudioEngine';

// --- Mocks ---

const mockPostMessage = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

const mockWorkletNode = {
  port: {
    postMessage: mockPostMessage,
  },
  connect: mockConnect,
  disconnect: mockDisconnect,
};

const mockSetTargetAtTime = vi.fn();
const mockGainNode = {
  gain: { value: 1, setTargetAtTime: mockSetTargetAtTime },
  connect: vi.fn(),
  disconnect: vi.fn(),
};
const mockCreateGain = vi.fn().mockImplementation(() => mockGainNode);

const mockResume = vi.fn().mockResolvedValue(undefined);
const mockSuspend = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockAddModule = vi.fn().mockResolvedValue(undefined);

let mockState: AudioContextState = 'suspended';

const MockAudioContext = vi.fn().mockImplementation(() => ({
  get state() {
    return mockState;
  },
  sampleRate: 48000,
  currentTime: 0,
  createGain: mockCreateGain,
  resume: mockResume,
  suspend: mockSuspend,
  close: mockClose,
  audioWorklet: {
    addModule: mockAddModule,
  },
  destination: {},
}));

const MockAudioWorkletNode = vi.fn().mockImplementation(() => mockWorkletNode);

// Install mocks on globalThis
vi.stubGlobal('AudioContext', MockAudioContext);
vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

describe('AudioEngine', () => {
  let engine: AudioEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGainNode.gain.value = 1;
    mockState = 'suspended';
    engine = new AudioEngine();
  });

  afterEach(async () => {
    // cleanup
  });

  it('creates AudioContext in suspended state', () => {
    expect(MockAudioContext).toHaveBeenCalled();
    expect(engine.getState()).toBe('suspended');
  });

  it('reports sample rate', () => {
    expect(engine.getSampleRate()).toBe(48000);
  });

  describe('initialize', () => {
    it('loads the worklet module and routes it through the master volume', async () => {
      await engine.initialize();

      expect(mockAddModule).toHaveBeenCalledTimes(1);
      expect(String(mockAddModule.mock.calls[0][0])).toMatch(/processor/);
      expect(MockAudioWorkletNode).toHaveBeenCalledTimes(1);
      expect(mockConnect).toHaveBeenCalledWith(mockGainNode);
      expect(mockGainNode.connect).toHaveBeenCalled();
    });

    it('only sets up once, however often play is pressed', async () => {
      await engine.initialize();
      await engine.initialize();
      await Promise.all([engine.initialize(), engine.initialize()]);

      expect(mockAddModule).toHaveBeenCalledTimes(1);
      expect(MockAudioWorkletNode).toHaveBeenCalledTimes(1);
    });
  });

  describe('volume', () => {
    it('applies a volume chosen before play to the output chain', async () => {
      engine.setVolume(0.5);
      await engine.initialize();
      expect(mockGainNode.gain.value).toBeCloseTo(0.25, 6);   // audio taper: gain = volume²
    });

    it('ramps to a new volume without clicking', async () => {
      await engine.initialize();
      engine.setVolume(0.8);
      expect(mockSetTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.64, 6), 0, expect.any(Number));
    });

    it('mute silences the output and unmute restores the volume', async () => {
      await engine.initialize();
      engine.setVolume(0.5);
      engine.setMuted(true);
      expect(mockSetTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));
      engine.setMuted(false);
      expect(mockSetTargetAtTime).toHaveBeenLastCalledWith(expect.closeTo(0.25, 6), 0, expect.any(Number));
    });

    it('clamps out-of-range volumes', async () => {
      await engine.initialize();
      engine.setVolume(5);
      expect(mockSetTargetAtTime).toHaveBeenLastCalledWith(1, 0, expect.any(Number));
      engine.setVolume(-1);
      expect(mockSetTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));
    });
  });

  describe('worklet messages', () => {
    it('posts the circuit, parameter changes and probes to the worklet', async () => {
      await engine.initialize();
      engine.loadCircuit([], []);
      engine.setParam('pot1', 'position', 0.25);
      engine.setProbes([{ componentId: 'c', pinId: 'p' }]);
      engine.startSimulation();

      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'loadCircuit', components: [], connections: [] });
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'setParam', componentId: 'pot1', key: 'position', value: 0.25 });
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'setProbes', probes: [{ componentId: 'c', pinId: 'p' }] });
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'start' });
    });

    it('does nothing before initialization', () => {
      engine.loadCircuit([], []);
      engine.setParam('pot1', 'position', 0.25);
      expect(mockPostMessage).not.toHaveBeenCalled();
    });
  });

  describe('resume / suspend', () => {
    it('resume calls through to AudioContext.resume', async () => {
      await engine.resume();
      expect(mockResume).toHaveBeenCalled();
    });

    it('suspend calls through to AudioContext.suspend', async () => {
      await engine.suspend();
      expect(mockSuspend).toHaveBeenCalled();
    });
  });

  describe('updateCircuit', () => {
    const pot = (position: number, maxResistance = 100000) => ({
      id: 'pot1', type: 'potentiometer',
      pins: [{ id: 'a', label: '1', type: 'bidirectional' }, { id: 'w', label: '2', type: 'bidirectional' }],
      parameters: { maxResistance, position },
    });
    const sw = (closed: number) => ({
      id: 'sw1', type: 'switch',
      pins: [{ id: 'a', label: '1', type: 'bidirectional' }, { id: 'b', label: '2', type: 'bidirectional' }],
      parameters: { closed },
    });
    const wires = [{ id: 'w1', from: { componentId: 'pot1', pinId: 'w' }, to: { componentId: 'sw1', pinId: 'a' } }];
    const loads = () => mockPostMessage.mock.calls.filter(([m]) => m.type === 'loadCircuit').length;

    it('sends a turned knob as a parameter change, not a reload', async () => {
      await engine.initialize();
      engine.loadCircuit([pot(0.5), sw(1)], wires);
      mockPostMessage.mockClear();

      engine.updateCircuit([pot(0.6), sw(1)], wires);

      expect(loads()).toBe(0);
      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'setParam', componentId: 'pot1', key: 'position', value: 0.6 });
    });

    it('sends a flipped switch as a parameter change', async () => {
      await engine.initialize();
      engine.loadCircuit([pot(0.5), sw(1)], wires);
      mockPostMessage.mockClear();

      engine.updateCircuit([pot(0.5), sw(0)], wires);

      expect(loads()).toBe(0);
      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'setParam', componentId: 'sw1', key: 'closed', value: 0 });
    });

    it('sends nothing when the circuit is electrically unchanged (a part was only moved)', async () => {
      await engine.initialize();
      engine.loadCircuit([pot(0.5), sw(1)], wires);
      mockPostMessage.mockClear();

      engine.updateCircuit([pot(0.5), sw(1)], [{ ...wires[0], id: 'renumbered' }]);

      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('reloads when a component value, a wire or a part changes', async () => {
      await engine.initialize();
      engine.loadCircuit([pot(0.5), sw(1)], wires);

      engine.updateCircuit([pot(0.5, 1e6), sw(1)], wires);        // different pot value
      expect(loads()).toBe(2);
      engine.updateCircuit([pot(0.5, 1e6), sw(1)], []);           // wire removed
      expect(loads()).toBe(3);
      engine.updateCircuit([pot(0.5, 1e6)], []);                  // part removed
      expect(loads()).toBe(4);
    });

    it('loads the circuit if nothing has been loaded yet', async () => {
      await engine.initialize();
      engine.updateCircuit([pot(0.5)], []);
      expect(loads()).toBe(1);
    });
  });

  describe('close', () => {
    it('closes the AudioContext', async () => {
      await engine.close();
      expect(mockClose).toHaveBeenCalled();
    });

    it('disconnects the worklet node if initialized', async () => {
      await engine.initialize();
      await engine.close();
      expect(mockDisconnect).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
