import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './OscilloscopePanel.module.css';

const TIME_SCALE_OPTIONS = [1, 2, 5, 10, 20, 50, 100]; // ms/div
const VOLT_SCALE_OPTIONS = [0.5, 1, 2, 5]; // V/div
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;
const H_DIVS = 10;
const V_DIVS = 8;
const MAX_SAMPLES = 48000; // ~1 second at 48kHz

interface OscilloscopePanelProps {
  onRegisterSampleCallback?: (cb: (samples: Float32Array) => void) => void;
}

export default function OscilloscopePanel({ onRegisterSampleCallback }: OscilloscopePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [timeScale, setTimeScale] = useState(5);
  const [voltScale, setVoltScale] = useState(5);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleBuffer = useRef<Float32Array>(new Float32Array(MAX_SAMPLES));
  const writePos = useRef(0);
  const totalWritten = useRef(0);
  const animFrameRef = useRef<number | null>(null);

  // Register sample callback with parent
  const handleSamples = useCallback((samples: Float32Array) => {
    const buf = sampleBuffer.current;
    for (let i = 0; i < samples.length; i++) {
      buf[writePos.current % MAX_SAMPLES] = samples[i];
      writePos.current++;
    }
    totalWritten.current += samples.length;
  }, []);

  useEffect(() => {
    if (onRegisterSampleCallback) {
      onRegisterSampleCallback(handleSamples);
    }
  }, [onRegisterSampleCallback, handleSamples]);

  // Render loop
  useEffect(() => {
    if (!expanded) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { animFrameRef.current = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrameRef.current = requestAnimationFrame(draw); return; }

      // Background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const divW = CANVAS_WIDTH / H_DIVS;
      const divH = CANVAS_HEIGHT / V_DIVS;

      // Grid
      ctx.strokeStyle = '#333';
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 0.5;
      for (let i = 1; i < H_DIVS; i++) {
        ctx.beginPath();
        ctx.moveTo(i * divW, 0);
        ctx.lineTo(i * divW, CANVAS_HEIGHT);
        ctx.stroke();
      }
      for (let i = 1; i < V_DIVS; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * divH);
        ctx.lineTo(CANVAS_WIDTH, i * divH);
        ctx.stroke();
      }

      // Center line (0V)
      ctx.setLineDash([]);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const centerY = CANVAS_HEIGHT / 2;
      ctx.moveTo(0, centerY);
      ctx.lineTo(CANVAS_WIDTH, centerY);
      ctx.stroke();

      // Waveform
      const buf = sampleBuffer.current;
      const totalVoltRange = voltScale * V_DIVS; // total voltage range displayed
      const sampleRate = 48000;
      const totalTimeMs = timeScale * H_DIVS; // total time displayed in ms
      const totalSamples = Math.floor((totalTimeMs / 1000) * sampleRate);
      const samplesPerPixel = Math.max(1, Math.floor(totalSamples / CANVAS_WIDTH));

      const currentWrite = writePos.current;
      if (currentWrite < 2) {
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      // Map samples from [-1,1] (normalized audio) to voltage
      // The worklet normalizes output as (V/Vdd)*2-1, so voltage = (sample+1)/2 * Vdd
      const vdd = 9; // supply voltage

      ctx.strokeStyle = '#FF2D55';
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      let started = false;
      for (let px = 0; px < CANVAS_WIDTH; px++) {
        // Which sample index corresponds to this pixel
        const sampleOffset = totalSamples - (CANVAS_WIDTH - px) * samplesPerPixel;
        const idx = (currentWrite + sampleOffset) % MAX_SAMPLES;
        if (idx < 0) continue;

        const sample = buf[((idx % MAX_SAMPLES) + MAX_SAMPLES) % MAX_SAMPLES];
        // Convert from [-1,1] back to voltage
        const voltage = (sample + 1) / 2 * vdd;
        // Map voltage to Y position. Center = Vdd/2, range = voltScale * V_DIVS
        const vCenter = vdd / 2;
        const y = centerY - ((voltage - vCenter) / totalVoltRange) * CANVAS_HEIGHT;

        if (!started) {
          ctx.moveTo(px, y);
          started = true;
        } else {
          ctx.lineTo(px, y);
        }
      }
      ctx.stroke();

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [expanded, timeScale, voltScale]);

  return (
    <div
      className={`${styles.panel} ${expanded ? styles.expanded : styles.collapsed}`}
      data-testid="oscilloscope-panel"
    >
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <span className={styles.title}>SCOPE</span>
        {!expanded && (
          <svg className={styles.waveformPreview} viewBox="0 0 300 20" preserveAspectRatio="none">
            <path
              d="M0,10 Q15,2 30,10 T60,10 T90,10 T120,10 T150,10 T180,10 T210,10 T240,10 T270,10 T300,10"
              stroke="#FF2D55"
              fill="none"
              strokeWidth="1"
            />
          </svg>
        )}
        {expanded && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '8px', marginRight: '12px' }}>
            <span style={{ fontSize: '9px', color: '#666' }}>{timeScale}ms/div</span>
            <span style={{ fontSize: '9px', color: '#666' }}>|</span>
            <span style={{ fontSize: '9px', color: '#666' }}>{voltScale}V/div</span>
          </div>
        )}
        <button
          className={styles.toggleBtn}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? '▼' : '▲'}
        </button>
      </div>

      {expanded && (
        <div className={styles.body}>
          <div className={styles.canvasArea}>
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              data-testid="waveform-canvas"
              style={{ borderRadius: '4px', width: '100%', height: '100%' }}
            />
          </div>

          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>Time/div</label>
              <select
                className={styles.controlSelect}
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}
              >
                {TIME_SCALE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}ms
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>Volts/div</label>
              <select
                className={styles.controlSelect}
                value={voltScale}
                onChange={(e) => setVoltScale(Number(e.target.value))}
              >
                {VOLT_SCALE_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}V
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
