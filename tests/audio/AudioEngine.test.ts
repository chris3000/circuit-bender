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
/** What the browser says about lost sound; undefined in a browser that does not say. */
let mockPlaybackStats: { underrunDuration: number } | undefined;

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
  get playbackStats() {
    return mockPlaybackStats;
  },
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
    mockPlaybackStats = undefined;
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
      engine.setBend({ from: { componentId: 'a', pinId: '1' }, to: { componentId: 'b', pinId: '2' } });
      expect(mockPostMessage).not.toHaveBeenCalled();
    });

    it('holds a bend in the running circuit and lets go of it, without reloading', async () => {
      await engine.initialize();
      engine.loadCircuit([], []);
      mockPostMessage.mockClear();
      const bend = { from: { componentId: 'a', pinId: '1' }, to: { componentId: 'b', pinId: '2' }, ohms: 10e3 };

      engine.setBend(bend);
      engine.setBend(null);

      expect(mockPostMessage.mock.calls.map(([m]) => m)).toEqual([{ type: 'setBend', bend }, { type: 'setBend', bend: null }]);
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

    it.each([
      ['pushbutton', 'closed', 0, 1],
      ['power', 'starve', 0, 0.4],
      ['ldr', 'light', 0.5, 0.9],
      ['body-contact', 'touch', 0, 0.6],
      ['lm386', 'gain', 20, 200],
      ['audio-output', 'gain', 1, 0.5],
    ])('sends a %s\'s %s as a parameter change', async (type, key, before, after) => {
      const part = (value: number) => ({
        id: 'p1', type, pins: [{ id: 'a', label: '1', type: 'bidirectional' }], parameters: { [key]: value, other: 1 },
      });
      await engine.initialize();
      engine.loadCircuit([part(before)], []);
      mockPostMessage.mockClear();

      engine.updateCircuit([part(after)], []);

      expect(mockPostMessage.mock.calls.map(([m]) => m)).toEqual([{ type: 'setParam', componentId: 'p1', key, value: after }]);
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
  describe('load', () => {
    /** What the worklet says, as the engine hears it. */
    const fromWorklet = (data: unknown) =>
      (mockWorkletNode.port as unknown as { onmessage: (event: { data: unknown }) => void }).onmessage({ data });
    let clock: ReturnType<typeof vi.spyOn>;
    let now = 0;

    beforeEach(() => {
      now = 10_000;
      clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    });
    afterEach(() => clock.mockRestore());

    it('passes on how hard the simulation is working', async () => {
      const heard = vi.fn();
      engine.onLoad(heard);
      await engine.initialize();
      fromWorklet({ type: 'load', load: 0.42 });
      expect(heard).toHaveBeenCalledWith({ load: 0.42, dropout: 0 });
    });

    it('adds the sound the browser says was lost since the last report', async () => {
      const heard = vi.fn();
      engine.onLoad(heard);
      await engine.initialize();
      mockPlaybackStats = { underrunDuration: 0 };
      fromWorklet({ type: 'load', load: 1.3 });
      mockPlaybackStats = { underrunDuration: 0.25 };
      fromWorklet({ type: 'load', load: 1.3 });
      fromWorklet({ type: 'load', load: 1.3 });
      mockPlaybackStats = { underrunDuration: 0.4 };
      fromWorklet({ type: 'load', load: 1.3 });
      expect(heard.mock.calls.map(([report]) => report.dropout)).toEqual([0, 0.25, 0, expect.closeTo(0.15, 6)]);
    });

    it('does not count the break in the sound that loading a circuit makes', async () => {
      const heard = vi.fn();
      engine.onLoad(heard);
      await engine.initialize();
      mockPlaybackStats = { underrunDuration: 1 };
      engine.loadCircuit([], []);
      now += 500;
      mockPlaybackStats = { underrunDuration: 1.02 };
      fromWorklet({ type: 'load', load: 0.2 });
      expect(heard).toHaveBeenLastCalledWith({ load: 0.2, dropout: 0 });
      // ...nor later, as if it had only just happened
      now += 2000;
      fromWorklet({ type: 'load', load: 0.2 });
      expect(heard).toHaveBeenLastCalledWith({ load: 0.2, dropout: 0 });
      mockPlaybackStats = { underrunDuration: 1.05 };
      fromWorklet({ type: 'load', load: 0.2 });
      expect(heard).toHaveBeenLastCalledWith({ load: 0.2, dropout: expect.closeTo(0.03, 6) });
    });
  });
});
