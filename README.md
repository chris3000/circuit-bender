# Circuit Bender

A browser-based circuit simulation app for creative audio and circuit bending. Build oscillators, blink LEDs, and hear your circuits in real-time.

## Features

- **Visual schematic editor** — drag components, click pins to wire, see your circuit take shape
- **Real-time audio simulation** — MNA (Modified Nodal Analysis) solver runs at audio sample rate in an AudioWorklet
- **Oscilloscope** — probe any wire to see voltage waveforms in real-time
- **LED simulation** — LEDs glow on the schematic when forward-biased
- **Interactive controls** — potentiometer slider changes pitch in real-time
- **Example circuits** — 5 pre-built circuits to get started immediately

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Example Circuits

Load from the **Examples** menu in the header:

| Example | Description | Frequency |
|---------|-------------|-----------|
| Simple Oscillator | CD40106 + R + C square wave | 440Hz (A4) |
| Low Drone | Deep bass tone | ~177Hz |
| High Chirp | Bright treble | ~1.77kHz |
| LED Blinker | Visible blinking LED | ~0.83Hz |
| Pitch Control | Potentiometer sweeps frequency | 80Hz - 1.8kHz |

## How It Works

### Simulation

The simulation engine uses **Modified Nodal Analysis** — the same technique used in SPICE circuit simulators. Each timestep:

1. Components stamp conductance values into a matrix
2. Gaussian elimination solves all node voltages simultaneously
3. Capacitors use trapezoidal integration for accurate RC time constants
4. Schmitt trigger gates model hysteresis with switchable voltage sources

The solver runs inside an **AudioWorkletProcessor** at the browser's native sample rate (~48kHz), producing glitch-free audio decoupled from the display refresh rate.

### Components

| Component | Description |
|-----------|-------------|
| Resistor | Ohm's law conductance stamp |
| Capacitor | Trapezoidal companion model (resistor + current source) |
| CD40106 | 6 Schmitt trigger inverter gates with hysteresis |
| Potentiometer | Variable resistor with interactive slider |
| Power Supply | 9V source with + and - terminals |
| Ground | 0V reference |
| Audio Output | Captures voltage for speaker output |
| LED | Lights up when forward-biased |

### Interaction

- **Drag** component body to move
- **Click pins** (mousedown/mouseup) to wire
- **Right-click** a wire to add an oscilloscope probe
- **Drag** the potentiometer slider to change resistance

## Tech Stack

- React + TypeScript + Vite
- SVG schematic rendering
- Web Audio API (AudioWorklet)
- dnd-kit for drag and drop
- Canvas for breadboard and oscilloscope views

## Design

Candy Lab + Mono Pop design system — monospace typography, monochrome palette with hot pink (#FF2D55) accent.

## License

MIT
