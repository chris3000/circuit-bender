/**
 * CircuitSimulationProcessor — AudioWorkletProcessor that runs a
 * time-stepped circuit simulation at the exact audio sample rate.
 *
 * Receives circuit topology from main thread via postMessage.
 * Simulates per-sample with real component models (capacitor charging,
 * Schmitt trigger thresholds). Writes output directly to audio buffer.
 */
class CircuitSimulationProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Circuit topology
    this.components = [];  // [{ id, type, pins, parameters }]
    this.connections = [];
    this.nets = [];        // [{ id, pinKeys: ['compId::pinId', ...] }]
    this.running = false;

    // Simulation state
    this.nodeVoltages = {}; // netId -> voltage
    this.capStates = {};    // componentId -> voltage across capacitor
    this.schmittStates = {}; // componentId -> [gateOutputHigh x 6]
    this.supplyVoltage = 9;

    // For posting samples back to main thread (oscilloscope)
    this.sampleBuffer = new Float32Array(128);
    this.sampleIndex = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'loadCircuit') {
        this.loadCircuit(msg.components, msg.connections);
      } else if (msg.type === 'setParam') {
        this.setParam(msg.componentId, msg.key, msg.value);
      } else if (msg.type === 'start') {
        this.running = true;
      } else if (msg.type === 'stop') {
        this.running = false;
        this.resetState();
      }
    };
  }

  loadCircuit(components, connections) {
    this.components = components;
    this.connections = connections;
    this.buildNets();
    this.resetState();
    this.findSupplyVoltage();
  }

  setParam(componentId, key, value) {
    const comp = this.components.find(c => c.id === componentId);
    if (comp) {
      comp.parameters[key] = value;
    }
  }

  resetState() {
    this.nodeVoltages = {};
    this.capStates = {};
    this.schmittStates = {};
    for (const comp of this.components) {
      if (comp.type === 'capacitor') {
        this.capStates[comp.id] = 0;
      }
      if (comp.type === 'cd40106') {
        // 6 gates, all start with output HIGH
        this.schmittStates[comp.id] = [true, true, true, true, true, true];
      }
    }
  }

  findSupplyVoltage() {
    for (const comp of this.components) {
      if (comp.type === 'power') {
        this.supplyVoltage = comp.parameters.voltage || 9;
        return;
      }
    }
    this.supplyVoltage = 9;
  }

  // --- Net building (union-find) ---

  buildNets() {
    const parent = {};
    const rank = {};

    const find = (x) => {
      if (!(x in parent)) { parent[x] = x; rank[x] = 0; }
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]]; // path compression
        x = parent[x];
      }
      return x;
    };

    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) { parent[ra] = rb; }
      else if (rank[ra] > rank[rb]) { parent[rb] = ra; }
      else { parent[rb] = ra; rank[ra]++; }
    };

    // Union connected pins
    for (const conn of this.connections) {
      const fromKey = conn.from.componentId + '::' + conn.from.pinId;
      const toKey = conn.to.componentId + '::' + conn.to.pinId;
      union(fromKey, toKey);
    }

    // Build net groups
    const groups = {};
    for (const key of Object.keys(parent)) {
      const root = find(key);
      if (!groups[root]) groups[root] = [];
      groups[root].push(key);
    }

    // Assign net IDs
    this.nets = [];
    this.pinToNet = {}; // 'compId::pinId' -> netIndex
    let netId = 0;
    for (const root of Object.keys(groups)) {
      const pinKeys = groups[root];
      this.nets.push({ id: netId, pinKeys });
      for (const key of pinKeys) {
        this.pinToNet[key] = netId;
      }
      netId++;
    }
  }

  getNetForPin(componentId, pinId) {
    const key = componentId + '::' + pinId;
    const netId = this.pinToNet[key];
    return netId !== undefined ? netId : -1;
  }

  getNodeVoltage(componentId, pinId) {
    const netId = this.getNetForPin(componentId, pinId);
    if (netId === -1) return 0;
    return this.nodeVoltages[netId] || 0;
  }

  setNodeVoltage(netId, voltage) {
    this.nodeVoltages[netId] = voltage;
  }

  // --- Simulation step ---

  step(dt) {
    const vdd = this.supplyVoltage;
    if (vdd === 0) return 0;

    // Track which nets are driven by sources (power, ground, IC outputs, capacitors)
    // Resistors can only propagate TO nets that are NOT source-driven
    const drivenNets = new Set();

    // Phase 1: Set fixed voltage sources
    for (const comp of this.components) {
      if (comp.type === 'power') {
        const posNet = this.getNetForPin(comp.id, comp.pins[0].id);
        if (posNet !== -1) { this.setNodeVoltage(posNet, vdd); drivenNets.add(posNet); }
        const gndNet = this.getNetForPin(comp.id, comp.pins[1].id);
        if (gndNet !== -1) { this.setNodeVoltage(gndNet, 0); drivenNets.add(gndNet); }
      }
      if (comp.type === 'ground') {
        const net = this.getNetForPin(comp.id, comp.pins[0].id);
        if (net !== -1) { this.setNodeVoltage(net, 0); drivenNets.add(net); }
      }
    }

    // Phase 2: Resolve Schmitt trigger outputs
    for (const comp of this.components) {
      if (comp.type !== 'cd40106') continue;

      const gates = this.schmittStates[comp.id];
      if (!gates) continue;

      const vddPin = this.getNodeVoltage(comp.id, comp.pins[12].id);
      const highThresh = vddPin * 0.66;
      const lowThresh = vddPin * 0.33;

      for (let g = 0; g < 6; g++) {
        const inputPinId = comp.pins[g].id;
        const outputPinId = comp.pins[g + 6].id;

        const vIn = this.getNodeVoltage(comp.id, inputPinId);

        if (gates[g] && vIn > highThresh) {
          gates[g] = false;
        } else if (!gates[g] && vIn < lowThresh) {
          gates[g] = true;
        }

        const vOut = gates[g] ? vddPin : 0;
        const outNet = this.getNetForPin(comp.id, outputPinId);
        if (outNet !== -1) { this.setNodeVoltage(outNet, vOut); drivenNets.add(outNet); }
      }
    }

    // Phase 3: Update capacitors
    for (const comp of this.components) {
      if (comp.type !== 'capacitor') continue;

      const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
      const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
      if (net0 === -1 || net1 === -1) continue;

      const capacitance = (comp.parameters.capacitance || 100e-9);
      const vCap = this.capStates[comp.id] || 0;

      const drivingV = this.findDrivingVoltage(net0, comp.id);
      const seriesR = this.findSeriesResistance(net0, comp.id);

      if (seriesR > 0) {
        const tau = seriesR * capacitance;
        const alpha = 1 - Math.exp(-dt / tau);
        const newVCap = vCap + (drivingV - vCap) * alpha;
        this.capStates[comp.id] = newVCap;

        this.setNodeVoltage(net0, newVCap);
        drivenNets.add(net0);
      }
    }

    // Phase 4: Propagate voltage through resistors to undriven nets
    // Only propagate FROM a driven net TO an undriven net. Never overwrite driven nets.
    for (const comp of this.components) {
      if (comp.type !== 'resistor') continue;

      const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
      const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
      if (net0 === -1 || net1 === -1) continue;

      const driven0 = drivenNets.has(net0);
      const driven1 = drivenNets.has(net1);

      if (driven0 && !driven1) {
        this.setNodeVoltage(net1, this.nodeVoltages[net0] || 0);
      } else if (driven1 && !driven0) {
        this.setNodeVoltage(net0, this.nodeVoltages[net1] || 0);
      }
    }

    // Phase 5: Potentiometers
    for (const comp of this.components) {
      if (comp.type !== 'potentiometer') continue;

      const pin0Net = this.getNetForPin(comp.id, comp.pins[0].id);
      const pin1Net = this.getNetForPin(comp.id, comp.pins[1].id);
      const wiperNet = this.getNetForPin(comp.id, comp.pins[2].id);
      if (pin0Net === -1 || pin1Net === -1 || wiperNet === -1) continue;

      const v0 = this.nodeVoltages[pin0Net] || 0;
      const v1 = this.nodeVoltages[pin1Net] || 0;
      const position = (comp.parameters.position || 0.5);

      const wiperV = v0 + (v1 - v0) * position;
      this.setNodeVoltage(wiperNet, wiperV);
    }

    // Phase 6: Read audio output
    for (const comp of this.components) {
      if (comp.type === 'audio-output') {
        const v = this.getNodeVoltage(comp.id, comp.pins[0].id);
        const sample = (v / vdd) * 2 - 1;
        return Math.max(-1, Math.min(1, sample));
      }
    }

    return 0;
  }

  // Find total series resistance connected to a net (excluding the given component)
  findSeriesResistance(netId, excludeCompId) {
    let totalR = 0;
    for (const comp of this.components) {
      if (comp.id === excludeCompId) continue;
      if (comp.type === 'resistor') {
        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
        if (net0 === netId || net1 === netId) {
          totalR += (comp.parameters.resistance || 1000);
        }
      }
      if (comp.type === 'potentiometer') {
        // Check all 3 pins (pin 0, pin 1/wiper, pin 2)
        const pinNets = comp.pins.map(p => this.getNetForPin(comp.id, p.id));
        const onNet = pinNets.some(n => n === netId);
        if (onNet) {
          const maxR = comp.parameters.maxResistance || 1000000;
          const position = comp.parameters.position || 0.5;
          // When used as variable resistor between pins 0 and 2,
          // effective resistance depends on wiper position
          totalR += maxR * Math.max(0.01, position);
        }
      }
    }
    return totalR || 1000; // Default 1k if no resistor found
  }

  // Find the voltage driving a net through a resistor (the voltage on the resistor's other pin)
  findDrivingVoltage(netId, excludeCompId) {
    for (const comp of this.components) {
      if (comp.id === excludeCompId) continue;
      if (comp.type === 'resistor' || comp.type === 'potentiometer') {
        const pinNets = comp.pins.map(p => this.getNetForPin(comp.id, p.id));
        const matchIdx = pinNets.findIndex(n => n === netId);
        if (matchIdx !== -1) {
          // Return voltage from the first OTHER pin that has a voltage
          for (let i = 0; i < pinNets.length; i++) {
            if (i !== matchIdx && pinNets[i] !== -1) {
              const v = this.nodeVoltages[pinNets[i]] || 0;
              if (v !== 0) return v;
            }
          }
        }
      }
    }
    return 0;
  }

  // --- AudioWorkletProcessor interface ---

  process(inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];
    if (!channel) return true;

    const dt = 1 / sampleRate;

    for (let i = 0; i < channel.length; i++) {
      if (this.running && this.components.length > 0) {
        channel[i] = this.step(dt);
      } else {
        channel[i] = 0;
      }
    }

    // Copy to all output channels
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    // Post samples back to main thread for oscilloscope
    if (this.running && this.components.length > 0) {
      this.port.postMessage(
        { type: 'samples', samples: channel.slice() },
      );

      // Post LED states at ~60Hz (every ~800 samples at 48kHz)
      if (!this.ledFrameCount) this.ledFrameCount = 0;
      this.ledFrameCount += channel.length;
      if (this.ledFrameCount >= 800) {
        this.ledFrameCount = 0;
        const ledStates = {};
        for (const comp of this.components) {
          if (comp.type === 'led') {
            const anodeNet = this.getNetForPin(comp.id, comp.pins[0].id);
            const cathodeNet = this.getNetForPin(comp.id, comp.pins[1].id);
            const vAnode = anodeNet !== -1 ? (this.nodeVoltages[anodeNet] || 0) : 0;
            const vCathode = cathodeNet !== -1 ? (this.nodeVoltages[cathodeNet] || 0) : 0;
            const forwardVoltage = comp.parameters.forwardVoltage || 2.0;
            ledStates[comp.id] = (vAnode - vCathode) > forwardVoltage;
          }
        }
        if (Object.keys(ledStates).length > 0) {
          this.port.postMessage({ type: 'ledStates', states: ledStates });
        }
      }
    }

    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitSimulationProcessor);
