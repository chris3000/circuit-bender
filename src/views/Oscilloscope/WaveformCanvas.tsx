import { useRef, useEffect } from 'react';
import type { Probe } from './ProbeManager';

interface WaveformCanvasProps {
  probes: Probe[];
  timeScale: number; // ms/div
  voltScale: number; // V/div
  supplyVoltage: number;
}

const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;
const H_DIVS = 10;
const V_DIVS = 8;

export default function WaveformCanvas({
  probes,
  timeScale: _timeScale,
  voltScale,
  supplyVoltage: _supplyVoltage,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const divW = CANVAS_WIDTH / H_DIVS;
    const divH = CANVAS_HEIGHT / V_DIVS;

    // Grid lines (dotted)
    ctx.strokeStyle = '#333';
    ctx.setLineDash([2, 4]);
    ctx.lineWidth = 1;

    for (let i = 1; i < H_DIVS; i++) {
      const x = i * divW;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 1; i < V_DIVS; i++) {
      const y = i * divH;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_WIDTH, y);
      ctx.stroke();
    }

    // Center line (0V reference)
    ctx.setLineDash([]);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const centerY = CANVAS_HEIGHT / 2;
    ctx.moveTo(0, centerY);
    ctx.lineTo(CANVAS_WIDTH, centerY);
    ctx.stroke();

    // Waveforms
    const totalVoltRange = voltScale * V_DIVS;
    const pixelsPerVolt = CANVAS_HEIGHT / totalVoltRange;

    for (const probe of probes) {
      if (probe.samples.length < 2) continue;

      ctx.strokeStyle = probe.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      // Show the most recent samples that fit the canvas width
      const visibleSamples = Math.min(probe.samples.length, CANVAS_WIDTH);
      const startIdx = probe.samples.length - visibleSamples;

      for (let i = 0; i < visibleSamples; i++) {
        const x = CANVAS_WIDTH - visibleSamples + i;
        const voltage = probe.samples[startIdx + i];
        const y = centerY - voltage * pixelsPerVolt;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }
  }, [probes, voltScale, _timeScale, _supplyVoltage]);

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      data-testid="waveform-canvas"
      style={{ borderRadius: '4px' }}
    />
  );
}
