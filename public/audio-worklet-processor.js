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

    this.debugCount = 0;

    this.port.onmessage = (event) => {
      const msg = event.data;
      this.port.postMessage({ type: 'debug', msg: 'received: ' + msg.type });
      if (msg.type === 'loadCircuit') {
        this.loadCircuit(msg.components, msg.connections);
        this.port.postMessage({ type: 'debug', msg: 'loaded ' + msg.components.length + ' comps, ' + msg.connections.length + ' conns, ' + this.nets.length + ' nets' });
      } else if (msg.type === 'setParam') {
        this.setParam(msg.componentId, msg.key, msg.value);
      } else if (msg.type === 'start') {
        this.running = true;
        console.log('[WORKLET] started');
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

    // Phase 1: Set fixed voltage sources
    for (const comp of this.components) {
      if (comp.type === 'power') {
        // Pin 0 = positive terminal
        const posNet = this.getNetForPin(comp.id, comp.pins[0].id);
        if (posNet !== -1) this.setNodeVoltage(posNet, vdd);
        // Pin 1 = ground terminal
        const gndNet = this.getNetForPin(comp.id, comp.pins[1].id);
        if (gndNet !== -1) this.setNodeVoltage(gndNet, 0);
      }
      if (comp.type === 'ground') {
        const net = this.getNetForPin(comp.id, comp.pins[0].id);
        if (net !== -1) this.setNodeVoltage(net, 0);
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
        const inputPinId = comp.pins[g].id;      // pins 0-5 = inputs
        const outputPinId = comp.pins[g + 6].id; // pins 6-11 = outputs

        const vIn = this.getNodeVoltage(comp.id, inputPinId);

        // Schmitt trigger with hysteresis
        if (gates[g] && vIn > highThresh) {
          gates[g] = false; // output goes LOW
        } else if (!gates[g] && vIn < lowThresh) {
          gates[g] = true;  // output goes HIGH
        }

        const vOut = gates[g] ? vddPin : 0;
        const outNet = this.getNetForPin(comp.id, outputPinId);
        if (outNet !== -1) this.setNodeVoltage(outNet, vOut);
      }
    }

    // Phase 3: Compute currents through resistors and update capacitors
    for (const comp of this.components) {
      if (comp.type === 'resistor') {
        // Resistor between two nodes — current flows, but we don't
        // update node voltages directly (they're set by sources/caps).
        // The resistor's effect is felt through the capacitor it's in series with.
        continue;
      }

      if (comp.type === 'capacitor') {
        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
        if (net0 === -1 || net1 === -1) continue;

        const capacitance = (comp.parameters.capacitance || 100e-9);
        const vCap = this.capStates[comp.id] || 0;
        const vGnd = this.nodeVoltages[net1] || 0; // typically ground

        // Find the driving voltage: look for a resistor on the same
        // net as cap pin 0, and find the voltage on the resistor's OTHER pin
        const drivingV = this.findDrivingVoltage(net0, comp.id);
        const seriesR = this.findSeriesResistance(net0, comp.id);

        if (seriesR > 0) {
          // RC charging: capacitor voltage approaches driving voltage
          const tau = seriesR * capacitance;
          const alpha = 1 - Math.exp(-dt / tau);
          const newVCap = vCap + (drivingV - vCap) * alpha;
          this.capStates[comp.id] = newVCap;

          // Update the node voltage to the capacitor voltage
          // This is what the Schmitt trigger input sees
          this.setNodeVoltage(net0, newVCap);
        }
      }

      if (comp.type === 'potentiometer') {
        // Variable voltage divider
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
    }

    // Phase 4: Read audio output
    for (const comp of this.components) {
      if (comp.type === 'audio-output') {
        const v = this.getNodeVoltage(comp.id, comp.pins[0].id);
        // Normalize to [-1, 1]
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
        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
        if (net0 === netId || net1 === netId) {
          const maxR = comp.parameters.maxResistance || 1000000;
          const position = comp.parameters.position || 0.5;
          totalR += maxR * position;
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
        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
        if (net0 === netId) {
          return this.nodeVoltages[net1] || 0; // voltage on the OTHER side
        }
        if (net1 === netId) {
          return this.nodeVoltages[net0] || 0;
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

    if (this.running && this.debugCount < 3) {
      this.debugCount++;
      const min = Math.min(...channel);
      const max = Math.max(...channel);
      this.port.postMessage({ type: 'debug', msg: 'process: comps=' + this.components.length + ' min=' + min.toFixed(4) + ' max=' + max.toFixed(4) + ' nodeV=' + JSON.stringify(this.nodeVoltages) });
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
    }

    return true;
  }
}

registerProcessor('circuit-audio-processor', CircuitSimulationProcessor);
