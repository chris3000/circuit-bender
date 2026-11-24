import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './OscilloscopePanel.module.css';
import { useInstruments } from '@/views/Instruments';
import type { SignalReading } from '@/simulation/measure/signal';
import { formatSignal } from '@/utils/readings';
import { formatSweep, SCOPE_SECONDS, traceColumns } from './trace';

// ms/div. The slow ones are for things that can be watched: a blinking LED, a capacitor emptying
const TIME_SCALE_OPTIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const VOLT_SCALE_OPTIONS = [0.5, 1, 2, 5]; // V/div
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 200;
const H_DIVS = 10;
const V_DIVS = 8;
const SAMPLE_RATE = 48000;
const MAX_SAMPLES = SAMPLE_RATE * SCOPE_SECONDS;
const PROBE_COLORS = ['#FF2D55', '#00FF88', '#00AAFF', '#FFAA00'];

export interface ProbeTarget {
  componentId: string;
  pinId: string;
  label: string;
}

interface OscilloscopePanelProps {
  onRegisterSampleCallback?: (cb: (samples: Float32Array, probeData?: Float32Array[]) => void) => void;
  probes?: ProbeTarget[];
  onRemoveProbe?: (index: number) => void;
}

export default function OscilloscopePanel({ onRegisterSampleCallback, probes = [], onRemoveProbe }: OscilloscopePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [timeScale, setTimeScale] = useState(5);
  const [voltScale, setVoltScale] = useState(5);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // The panel lies over the bottom of the page: whatever must stay clear of it
  // (the class beside the canvas, with its buttons at the bottom) reads how tall it is
  useEffect(() => {
    document.documentElement.style.setProperty('--scope-height', expanded ? '240px' : '32px');
  }, [expanded]);

  // Each probe's reading (level, swing, frequency), while the panel is open to show it
  const { playing, meter } = useInstruments();
  const [readings, setReadings] = useState<SignalReading[]>([]);
  const watching = expanded && playing && probes.length > 0;
  useEffect(() => {
    if (!watching) { setReadings([]); return; }
    return meter((report) => setReadings(report.probes));
  }, [watching, meter]);

  // Audio output buffer (normalized [-1,1])
  const audioBuffer = useRef<Float32Array>(new Float32Array(MAX_SAMPLES));
  const audioWritePos = useRef(0);

  // What each column of the screen shows of a trace (its low and its high)
  const columns = useRef(new Float32Array(CANVAS_WIDTH * 2));

  // Probe buffers (raw voltage)
  const probeBuffers = useRef<Float32Array[]>([]);
  const probeWritePositions = useRef<number[]>([]);

  // Ensure probe buffers match probe count
  useEffect(() => {
    while (probeBuffers.current.length < probes.length) {
      probeBuffers.current.push(new Float32Array(MAX_SAMPLES));
      probeWritePositions.current.push(0);
    }
    // Trim if probes removed
    probeBuffers.current.length = probes.length;
    probeWritePositions.current.length = probes.length;
  }, [probes.length]);

  const handleSamples = useCallback((samples: Float32Array, probeData?: Float32Array[]) => {
    // Store audio output samples
    const buf = audioBuffer.current;
    for (let i = 0; i < samples.length; i++) {
      buf[audioWritePos.current % MAX_SAMPLES] = samples[i];
      audioWritePos.current++;
    }

    // Store probe samples
    if (probeData) {
      for (let p = 0; p < probeData.length && p < probeBuffers.current.length; p++) {
        const pbuf = probeBuffers.current[p];
        for (let i = 0; i < probeData[p].length; i++) {
          pbuf[probeWritePositions.current[p] % MAX_SAMPLES] = probeData[p][i];
          probeWritePositions.current[p]++;
        }
      }
    }
  }, []);

  useEffect(() => {
    if (onRegisterSampleCallback) {
      onRegisterSampleCallback(handleSamples);
    }
  }, [onRegisterSampleCallback, handleSamples]);

  // Render loop
  useEffect(() => {
    if (!expanded) {
      return;
    }

    let animFrame: number;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) { animFrame = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { animFrame = requestAnimationFrame(draw); return; }

      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const divW = CANVAS_WIDTH / H_DIVS;
      const divH = CANVAS_HEIGHT / V_DIVS;

      // Grid
      ctx.strokeStyle = '#333';
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 0.5;
      for (let i = 1; i < H_DIVS; i++) {
        ctx.beginPath(); ctx.moveTo(i * divW, 0); ctx.lineTo(i * divW, CANVAS_HEIGHT); ctx.stroke();
      }
      for (let i = 1; i < V_DIVS; i++) {
        ctx.beginPath(); ctx.moveTo(0, i * divH); ctx.lineTo(CANVAS_WIDTH, i * divH); ctx.stroke();
      }

      // Center line
      ctx.setLineDash([]);
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 0.5;
      const centerY = CANVAS_HEIGHT / 2;
      ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(CANVAS_WIDTH, centerY); ctx.stroke();

      const totalSamples = Math.floor((timeScale * H_DIVS / 1000) * SAMPLE_RATE);
      const totalVoltRange = voltScale * V_DIVS;
      const vdd = 9;
      const vCenter = vdd / 2;
      // Audio samples are AC-coupled, with a rail-to-rail swing at ±0.5
      const y = (raw: number, isNormalized: boolean) =>
        centerY - (((isNormalized ? vCenter + raw * vdd : raw) - vCenter) / totalVoltRange) * CANVAS_HEIGHT;

      // Draw function for a waveform: each column of the screen from the lowest to the highest value in it
      const drawWaveform = (buf: Float32Array, writePos: number, color: string, isNormalized: boolean) => {
        if (writePos < 2) return;
        traceColumns(buf, writePos, totalSamples, CANVAS_WIDTH, columns.current);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (let px = 0; px < CANVAS_WIDTH; px++) {
          const low = columns.current[2 * px], high = columns.current[2 * px + 1];
          if (Number.isNaN(low)) continue;
          if (!started) { ctx.moveTo(px, y(high, isNormalized)); started = true; }
          else ctx.lineTo(px, y(high, isNormalized));
          if (low !== high) ctx.lineTo(px, y(low, isNormalized));
        }
        ctx.stroke();
      };

      // Draw probe waveforms (if any)
      if (probes.length > 0) {
        for (let p = 0; p < probes.length && p < probeBuffers.current.length; p++) {
          const color = PROBE_COLORS[p % PROBE_COLORS.length];
          drawWaveform(probeBuffers.current[p], probeWritePositions.current[p], color, false);
        }
      } else {
        // No probes — show audio output waveform
        drawWaveform(audioBuffer.current, audioWritePos.current, '#FF2D55', true);
      }

      animFrame = requestAnimationFrame(draw);
    };

    animFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrame);
  }, [expanded, timeScale, voltScale, probes]);

  return (
    <div
      className={`${styles.panel} ${expanded ? styles.expanded : styles.collapsed}`}
      data-testid="oscilloscope-panel"
    >
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <span className={styles.title}>SCOPE</span>
        {!expanded && (
          <svg className={styles.waveformPreview} viewBox="0 0 300 20" preserveAspectRatio="none">
            <path d="M0,10 Q15,2 30,10 T60,10 T90,10 T120,10 T150,10 T180,10 T210,10 T240,10 T270,10 T300,10"
              stroke="#FF2D55" fill="none" strokeWidth="1" />
          </svg>
        )}
        {expanded && (
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', gap: '8px', marginRight: '12px' }}>
            <span style={{ fontSize: '9px', color: '#666' }}>{formatSweep(timeScale)}/div</span>
            <span style={{ fontSize: '9px', color: '#666' }}>|</span>
            <span style={{ fontSize: '9px', color: '#666' }}>{voltScale}V/div</span>
          </div>
        )}
        <button className={styles.toggleBtn} onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
          {expanded ? '▼' : '▲'}
        </button>
      </div>

      {expanded && (
        <div className={styles.body}>
          <div className={styles.probeControls}>
            {probes.length === 0 && (
              <div style={{ color: '#666', fontSize: '10px', padding: '4px' }}>
                Right-click a wire to probe
              </div>
            )}
            {probes.map((probe, i) => (
              <div key={i} className={styles.probeItem}>
                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: PROBE_COLORS[i % PROBE_COLORS.length] }}
                />
                <span className={styles.probeLabel}>
                  {probe.label}
                  {readings[i] && <span className={styles.probeReading} data-testid="probe-reading">{formatSignal(readings[i])}</span>}
                </span>
                <button
                  className={styles.removeBtn}
                  onClick={() => onRemoveProbe?.(i)}
                  title="Remove probe"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

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
              <select className={styles.controlSelect} value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value))}>
                {TIME_SCALE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{formatSweep(v)}</option>
                ))}
              </select>
            </div>
            <div className={styles.controlGroup}>
              <label className={styles.controlLabel}>Volts/div</label>
              <select className={styles.controlSelect} value={voltScale}
                onChange={(e) => setVoltScale(Number(e.target.value))}>
                {VOLT_SCALE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}V</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
