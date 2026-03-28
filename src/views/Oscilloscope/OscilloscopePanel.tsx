import { useState, useMemo } from 'react';
import type { ComponentId, PinId } from '@/types/circuit';
import { ProbeManager } from './ProbeManager';
import WaveformCanvas from './WaveformCanvas';
import styles from './OscilloscopePanel.module.css';

const TIME_SCALE_OPTIONS = [1, 2, 5, 10, 20, 50, 100]; // ms/div
const VOLT_SCALE_OPTIONS = [0.5, 1, 2, 5]; // V/div

export default function OscilloscopePanel() {
  const [expanded, setExpanded] = useState(false);
  const [timeScale, setTimeScale] = useState(10);
  const [voltScale, setVoltScale] = useState(2);
  const [, setVersion] = useState(0);
  const probeManager = useMemo(() => new ProbeManager(), []);

  const forceUpdate = () => setVersion((v) => v + 1);

  const handleAddProbe = () => {
    // Default probe target; in real usage this would come from a selection UI
    probeManager.addProbe('probe' as ComponentId, 'out' as PinId);
    forceUpdate();
  };

  const handleRemoveProbe = (index: number) => {
    probeManager.removeProbe(index);
    forceUpdate();
  };

  const probes = probeManager.getProbes();

  return (
    <div
      className={`${styles.panel} ${expanded ? styles.expanded : styles.collapsed}`}
      data-testid="oscilloscope-panel"
    >
      <div className={styles.header} onClick={() => setExpanded(!expanded)}>
        <span className={styles.title}>OSCILLOSCOPE</span>
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
          <div className={styles.probeControls}>
            <button
              className={styles.addProbeBtn}
              onClick={handleAddProbe}
              disabled={probes.length >= 4}
            >
              Add Probe
            </button>
            {probes.map((probe, i) => (
              <div key={i} className={styles.probeItem}>
                <span
                  className={styles.colorDot}
                  style={{ backgroundColor: probe.color }}
                />
                <span className={styles.probeLabel}>
                  {probe.componentId}:{probe.pinId}
                </span>
                <button
                  className={styles.removeBtn}
                  onClick={() => handleRemoveProbe(i)}
                  title="Remove probe"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className={styles.canvasArea}>
            <WaveformCanvas
              probes={probes}
              timeScale={timeScale}
              voltScale={voltScale}
              supplyVoltage={9}
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
