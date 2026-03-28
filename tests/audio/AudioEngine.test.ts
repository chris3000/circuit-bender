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
    it('loads worklet module and creates AudioWorkletNode', async () => {
      await engine.initialize();

      expect(mockAddModule).toHaveBeenCalledWith('/audio-worklet-processor.js');
      expect(MockAudioWorkletNode).toHaveBeenCalled();
      expect(mockConnect).toHaveBeenCalled();
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

  describe('sendSamples', () => {
    it('posts message to worklet port', async () => {
      await engine.initialize();

      const samples = new Float32Array([0.1, 0.2, 0.3]);
      engine.sendSamples(samples);

      expect(mockPostMessage).toHaveBeenCalledWith({
        type: 'samples',
        samples,
      });
    });

    it('does nothing if not initialized', () => {
      const samples = new Float32Array([0.1, 0.2, 0.3]);
      // Should not throw
      engine.sendSamples(samples);
      expect(mockPostMessage).not.toHaveBeenCalled();
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
