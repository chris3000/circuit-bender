import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioBridge } from '@/audio/AudioBridge';

describe('AudioBridge', () => {
  let bridge: AudioBridge;

  beforeEach(() => {
    bridge = new AudioBridge();
  });

  describe('BATCH_SIZE', () => {
    it('should be 128', () => {
      expect(AudioBridge.BATCH_SIZE).toBe(128);
    });
  });

  describe('voltageToSample', () => {
    it('maps 0V to -1 with default supply voltage', () => {
      // Formula: (0 / 9) * 2 - 1 = -1
      expect(bridge.voltageToSample(0, 9)).toBeCloseTo(-1);
    });

    it('maps mid-supply voltage to 0', () => {
      // Formula: (4.5 / 9) * 2 - 1 = 0
      expect(bridge.voltageToSample(4.5, 9)).toBeCloseTo(0);
    });

    it('maps supply voltage to +1', () => {
      // Formula: (9 / 9) * 2 - 1 = 1
      expect(bridge.voltageToSample(9, 9)).toBeCloseTo(1);
    });

    it('works with configurable supply voltage (5V)', () => {
      expect(bridge.voltageToSample(0, 5)).toBeCloseTo(-1);
      expect(bridge.voltageToSample(2.5, 5)).toBeCloseTo(0);
      expect(bridge.voltageToSample(5, 5)).toBeCloseTo(1);
    });

    it('works with configurable supply voltage (12V)', () => {
      expect(bridge.voltageToSample(0, 12)).toBeCloseTo(-1);
      expect(bridge.voltageToSample(6, 12)).toBeCloseTo(0);
      expect(bridge.voltageToSample(12, 12)).toBeCloseTo(1);
    });

    it('clamps values above +1', () => {
      // Voltage above supply: (15 / 9) * 2 - 1 > 1
      expect(bridge.voltageToSample(15, 9)).toBe(1);
    });

    it('clamps values below -1', () => {
      // Negative voltage: (-5 / 9) * 2 - 1 < -1
      expect(bridge.voltageToSample(-5, 9)).toBe(-1);
    });
  });

  describe('pushSample and buffer flush', () => {
    it('calls flush callback when buffer reaches BATCH_SIZE', () => {
      const callback = vi.fn();
      bridge.onBufferReady(callback);

      for (let i = 0; i < 128; i++) {
        bridge.pushSample(0.5);
      }

      expect(callback).toHaveBeenCalledTimes(1);
      const samples = callback.mock.calls[0][0] as Float32Array;
      expect(samples).toBeInstanceOf(Float32Array);
      expect(samples.length).toBe(128);
    });

    it('does not flush before reaching BATCH_SIZE', () => {
      const callback = vi.fn();
      bridge.onBufferReady(callback);

      for (let i = 0; i < 127; i++) {
        bridge.pushSample(0.5);
      }

      expect(callback).not.toHaveBeenCalled();
    });

    it('flushes multiple times when samples exceed BATCH_SIZE', () => {
      const callback = vi.fn();
      bridge.onBufferReady(callback);

      for (let i = 0; i < 256; i++) {
        bridge.pushSample(0.5);
      }

      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('does nothing if no callback is registered', () => {
      // Should not throw
      for (let i = 0; i < 128; i++) {
        bridge.pushSample(0.5);
      }
    });
  });

  describe('volume', () => {
    it('defaults to 1', () => {
      expect(bridge.getVolume()).toBe(1);
    });

    it('can be set and retrieved', () => {
      bridge.setVolume(0.5);
      expect(bridge.getVolume()).toBe(0.5);
    });

    it('applies volume to pushed samples', () => {
      const callback = vi.fn();
      bridge.onBufferReady(callback);
      bridge.setVolume(0.5);

      for (let i = 0; i < 128; i++) {
        bridge.pushSample(0.8);
      }

      const samples = callback.mock.calls[0][0] as Float32Array;
      // 0.8 * 0.5 = 0.4
      expect(samples[0]).toBeCloseTo(0.4);
    });

    it('clamps volume to [0, 1]', () => {
      bridge.setVolume(1.5);
      expect(bridge.getVolume()).toBe(1);

      bridge.setVolume(-0.5);
      expect(bridge.getVolume()).toBe(0);
    });
  });

  describe('mute', () => {
    it('defaults to unmuted', () => {
      expect(bridge.isMuted()).toBe(false);
    });

    it('can be toggled', () => {
      bridge.setMuted(true);
      expect(bridge.isMuted()).toBe(true);

      bridge.setMuted(false);
      expect(bridge.isMuted()).toBe(false);
    });

    it('outputs silence when muted', () => {
      const callback = vi.fn();
      bridge.onBufferReady(callback);
      bridge.setMuted(true);

      for (let i = 0; i < 128; i++) {
        bridge.pushSample(0.8);
      }

      const samples = callback.mock.calls[0][0] as Float32Array;
      for (let i = 0; i < samples.length; i++) {
        expect(samples[i]).toBe(0);
      }
    });
  });
});
