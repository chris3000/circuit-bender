/**
 * CircuitSimulationProcessor — AudioWorkletProcessor with MNA solver.
 *
 * Uses Modified Nodal Analysis to solve all node voltages simultaneously.
 * Handles series/parallel resistors, RC networks, voltage dividers — all
 * automatically through matrix stamping. No special-case hacks needed.
 *
 * Capacitors use trapezoidal companion model (resistor + current source).
 * Schmitt triggers modeled as switchable voltage sources.
 */
class CircuitSimulationProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.components = [];
    this.connections = [];
    this.running = false;
    this.supplyVoltage = 9;

    // MNA state
    this.numNodes = 0;       // number of circuit nodes (nets), excluding ground
    this.groundNet = -1;     // which net is ground (node 0 in MNA)
    this.netToNode = {};     // netId -> MNA node index (0-based, ground excluded)
    this.nodeToNet = {};     // MNA node index -> netId
    this.vsCount = 0;        // number of voltage sources
    this.matrixSize = 0;     // numNodes + vsCount
    this.nodeVoltages = {};  // netId -> voltage (for LED state reporting)

    // Component state
    this.capStates = {};     // componentId -> { vPrev, iPrev }
    this.schmittStates = {}; // componentId -> [outputHigh x 6]

    // Probes: [{componentId, pinId}]
    this.probes = [];
    this.probeSampleBuffers = []; // array of Float32Array(128) per probe

    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'loadCircuit') {
        this.loadCircuit(msg.components, msg.connections);
      } else if (msg.type === 'setParam') {
        const comp = this.components.find(c => c.id === msg.componentId);
        if (comp) comp.parameters[msg.key] = msg.value;
      } else if (msg.type === 'setProbes') {
        this.probes = msg.probes || [];
        this.probeSampleBuffers = this.probes.map(() => new Float32Array(128));
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
    this.buildNodeMap();
    this.resetState();
    this.findSupplyVoltage();
  }

  resetState() {
    this.nodeVoltages = {};
    this.capStates = {};
    this.schmittStates = {};
    this.diodeStates = {};
    this.transistorStates = {};
    for (const comp of this.components) {
      if (comp.type === 'capacitor') {
        this.capStates[comp.id] = { vPrev: 0, iPrev: 0 };
      }
      if (comp.type === 'cd40106') {
        this.schmittStates[comp.id] = [true, true, true, true, true, true];
      }
      if (comp.type === '1n914') {
        this.diodeStates[comp.id] = { vPrev: 0 };
      }
      if (comp.type === '2n3904') {
        this.transistorStates[comp.id] = { vbePrev: 0, vcePrev: 0 };
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
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };

    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      if (rank[ra] < rank[rb]) parent[ra] = rb;
      else if (rank[ra] > rank[rb]) parent[rb] = ra;
      else { parent[rb] = ra; rank[ra]++; }
    };

    for (const conn of this.connections) {
      union(conn.from.componentId + '::' + conn.from.pinId,
            conn.to.componentId + '::' + conn.to.pinId);
    }

    const groups = {};
    for (const key of Object.keys(parent)) {
      const root = find(key);
      if (!groups[root]) groups[root] = [];
      groups[root].push(key);
    }

    this.nets = [];
    this.pinToNet = {};
    let netId = 0;
    for (const root of Object.keys(groups)) {
      this.nets.push({ id: netId, pinKeys: groups[root] });
      for (const key of groups[root]) {
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

  // --- MNA node mapping ---

  buildNodeMap() {
    // Find the ground node — any net connected to a ground component or power supply's ground pin
    this.groundNet = -1;
    for (const comp of this.components) {
      if (comp.type === 'ground') {
        this.groundNet = this.getNetForPin(comp.id, comp.pins[0].id);
        break;
      }
      if (comp.type === 'power' && comp.pins.length > 1) {
        this.groundNet = this.getNetForPin(comp.id, comp.pins[1].id);
        break;
      }
    }

    // Map nets to MNA node indices, skipping ground
    this.netToNode = {};
    this.nodeToNet = {};
    let nodeIdx = 0;
    for (const net of this.nets) {
      if (net.id === this.groundNet) continue;
      this.netToNode[net.id] = nodeIdx;
      this.nodeToNet[nodeIdx] = net.id;
      nodeIdx++;
    }
    this.numNodes = nodeIdx;

    // Count voltage sources (power supply, schmitt outputs)
    this.vsCount = 0;
    this.vsSources = []; // [{ posNode, negNode, voltage }]

    for (const comp of this.components) {
      if (comp.type === 'power') {
        const posNet = this.getNetForPin(comp.id, comp.pins[0].id);
        const posNode = posNet !== -1 ? (this.netToNode[posNet] ?? -1) : -1;
        // Negative pin is ground (node -1 in MNA = ground reference)
        this.vsSources.push({
          posNode,
          negNode: -1, // ground
          voltage: comp.parameters.voltage || 9,
          compId: comp.id,
          type: 'power'
        });
        this.vsCount++;
      }
    }

    // Schmitt trigger outputs are voltage sources too
    for (const comp of this.components) {
      if (comp.type !== 'cd40106') continue;
      for (let g = 0; g < 6; g++) {
        const outNet = this.getNetForPin(comp.id, comp.pins[g + 6].id);
        const outNode = outNet !== -1 ? (this.netToNode[outNet] ?? -1) : -1;
        if (outNode === -1) continue; // not connected
        this.vsSources.push({
          posNode: outNode,
          negNode: -1, // ground reference
          voltage: this.supplyVoltage, // initial: high
          compId: comp.id,
          type: 'schmitt',
          gateIndex: g
        });
        this.vsCount++;
      }
    }

    // Op-amp outputs are voltage sources (clamped VCVS)
    for (const comp of this.components) {
      if (comp.type !== 'lm741') continue;
      const outNet = this.getNetForPin(comp.id, comp.pins[5].id); // pin 5 = OUT
      const outNode = outNet !== -1 ? (this.netToNode[outNet] ?? -1) : -1;
      if (outNode === -1) continue;
      this.vsSources.push({
        posNode: outNode,
        negNode: -1,
        voltage: this.supplyVoltage / 2, // initial: mid-rail
        compId: comp.id,
        type: 'opamp'
      });
      this.vsCount++;
    }

    this.matrixSize = this.numNodes + this.vsCount;
  }

  // --- MNA Solver ---

  step(dt) {
    if (this.matrixSize === 0) return 0;
    const N = this.matrixSize;
    const vdd = this.supplyVoltage;

    // Update Schmitt trigger voltage source values based on current state
    for (const vs of this.vsSources) {
      if (vs.type === 'schmitt') {
        const gates = this.schmittStates[vs.compId];
        if (gates) {
          vs.voltage = gates[vs.gateIndex] ? vdd : 0;
        }
      }
      // Update op-amp output voltage (clamped VCVS)
      if (vs.type === 'opamp') {
        const comp = this.components.find(c => c.id === vs.compId);
        if (comp) {
          const invNet = this.getNetForPin(comp.id, comp.pins[1].id);    // IN-
          const nonInvNet = this.getNetForPin(comp.id, comp.pins[2].id); // IN+
          const vpNet = this.getNetForPin(comp.id, comp.pins[6].id);     // V+
          const vmNet = this.getNetForPin(comp.id, comp.pins[3].id);     // V-
          const vInv = invNet !== -1 ? (this.nodeVoltages[invNet] || 0) : 0;
          const vNonInv = nonInvNet !== -1 ? (this.nodeVoltages[nonInvNet] || 0) : 0;
          const vRailPlus = vpNet !== -1 ? (this.nodeVoltages[vpNet] || 0) : vdd;
          const vRailMinus = vmNet !== -1 ? (this.nodeVoltages[vmNet] || 0) : 0;
          // Open-loop gain (reduced for single-timestep stability with feedback)
          const gain = 1000;
          const vTarget = Math.max(vRailMinus, Math.min(vRailPlus, gain * (vNonInv - vInv)));
          // Slew rate limiting: LM741 slews at ~0.5V/µs = 500000 V/s
          const slewRate = 500000;
          const maxDelta = slewRate * dt;
          const prev = vs.voltage;
          if (vTarget > prev + maxDelta) {
            vs.voltage = prev + maxDelta;
          } else if (vTarget < prev - maxDelta) {
            vs.voltage = prev - maxDelta;
          } else {
            vs.voltage = vTarget;
          }
        }
      }
    }

    // Build G matrix and b vector
    const G = new Array(N);
    const b = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      G[i] = new Float64Array(N);
    }

    // Stamp resistors: conductance 1/R between two nodes
    for (const comp of this.components) {
      if (comp.type === 'resistor') {
        const R = Math.max(comp.parameters.resistance || 1000, 1);
        const g = 1 / R;
        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
        const n0 = net0 !== -1 ? (this.netToNode[net0] ?? -1) : -1;
        const n1 = net1 !== -1 ? (this.netToNode[net1] ?? -1) : -1;
        this.stampConductance(G, n0, n1, g);
      }

      if (comp.type === 'potentiometer') {
        const maxR = comp.parameters.maxResistance || 1000000;
        const pos = Math.max(0.001, Math.min(0.999, comp.parameters.position || 0.5));

        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id); // wiper
        const net2 = this.getNetForPin(comp.id, comp.pins[2].id);

        const n0 = net0 !== -1 ? (this.netToNode[net0] ?? -1) : -1;
        const n1 = net1 !== -1 ? (this.netToNode[net1] ?? -1) : -1;
        const n2 = net2 !== -1 ? (this.netToNode[net2] ?? -1) : -1;

        if (n1 !== -1) {
          // Wiper is connected: two resistors (pin0-wiper, wiper-pin2)
          const R_top = maxR * pos;
          const R_bot = maxR * (1 - pos);
          this.stampConductance(G, n0, n1, 1 / R_top);
          this.stampConductance(G, n1, n2, 1 / R_bot);
        } else {
          // Wiper not connected: single variable resistor between pin0 and pin2
          const R = maxR * Math.max(0.01, pos);
          this.stampConductance(G, n0, n2, 1 / R);
        }
      }

      // Capacitor: trapezoidal companion model
      // At each timestep, cap becomes: conductance G_eq = 2C/dt
      // with companion current source I_eq = G_eq * V_prev + I_prev
      if (comp.type === 'capacitor') {
        const C = comp.parameters.capacitance || 100e-9;
        const Geq = 2 * C / dt;
        const state = this.capStates[comp.id] || { vPrev: 0, iPrev: 0 };

        const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
        const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
        const n0 = net0 !== -1 ? (this.netToNode[net0] ?? -1) : -1;
        const n1 = net1 !== -1 ? (this.netToNode[net1] ?? -1) : -1;

        // Stamp equivalent conductance
        this.stampConductance(G, n0, n1, Geq);

        // Stamp companion current source: Ieq = Geq * Vprev + Iprev
        const Ieq = Geq * state.vPrev + state.iPrev;
        // Current flows from n0 to n1, so inject +Ieq at n0, -Ieq at n1
        if (n0 !== -1) b[n0] += Ieq;
        if (n1 !== -1) b[n1] -= Ieq;
      }

      // 1N914 Diode: piecewise linear companion model
      if (comp.type === '1n914') {
        const netA = this.getNetForPin(comp.id, comp.pins[0].id); // Anode
        const netK = this.getNetForPin(comp.id, comp.pins[1].id); // Cathode
        const nA = netA !== -1 ? (this.netToNode[netA] ?? -1) : -1;
        const nK = netK !== -1 ? (this.netToNode[netK] ?? -1) : -1;
        const vA = netA !== -1 ? (this.nodeVoltages[netA] || 0) : 0;
        const vK = netK !== -1 ? (this.nodeVoltages[netK] || 0) : 0;
        const vd = vA - vK;

        if (vd > 0.6) {
          // Forward biased: low resistance + 0.6V drop companion
          const Gf = 1 / 10;
          this.stampConductance(G, nA, nK, Gf);
          const Ieq = Gf * 0.6;
          if (nA !== -1) b[nA] -= Ieq;
          if (nK !== -1) b[nK] += Ieq;
        } else {
          // Reverse biased: very high resistance
          this.stampConductance(G, nA, nK, 1 / 10000000);
        }
      }

      // 2N3904 NPN Transistor: linearized Ebers-Moll
      if (comp.type === '2n3904') {
        const netB = this.getNetForPin(comp.id, comp.pins[0].id); // Base
        const netC = this.getNetForPin(comp.id, comp.pins[1].id); // Collector
        const netE = this.getNetForPin(comp.id, comp.pins[2].id); // Emitter
        const nB = netB !== -1 ? (this.netToNode[netB] ?? -1) : -1;
        const nC = netC !== -1 ? (this.netToNode[netC] ?? -1) : -1;
        const nE = netE !== -1 ? (this.netToNode[netE] ?? -1) : -1;
        const vB = netB !== -1 ? (this.nodeVoltages[netB] || 0) : 0;
        const vC = netC !== -1 ? (this.nodeVoltages[netC] || 0) : 0;
        const vE = netE !== -1 ? (this.nodeVoltages[netE] || 0) : 0;
        const vbe = vB - vE;
        const vce = vC - vE;

        if (vbe <= 0.6) {
          // Cutoff: high resistance on all junctions
          this.stampConductance(G, nB, nE, 1 / 10000000);
          this.stampConductance(G, nC, nE, 1 / 10000000);
        } else if (vce > 0.2) {
          // Active: BE diode + voltage-controlled current source C→E
          const Gbe = 1 / 1000;
          this.stampConductance(G, nB, nE, Gbe);
          // BE forward drop companion current
          const Ieq_be = Gbe * 0.6;
          if (nB !== -1) b[nB] -= Ieq_be;
          if (nE !== -1) b[nE] += Ieq_be;
          // VCCS: Ic = beta * Ib, stamp as Gm controlled by Vbe
          const Gm = 100 * Gbe; // beta = 100
          if (nC !== -1 && nB !== -1) G[nC][nB] += Gm;
          if (nC !== -1 && nE !== -1) G[nC][nE] -= Gm;
          if (nE !== -1 && nB !== -1) G[nE][nB] -= Gm;
          if (nE !== -1) G[nE][nE] += Gm;
          // Companion current from BE voltage offset
          const Ieq_ce = Gm * 0.6;
          if (nC !== -1) b[nC] -= Ieq_ce;
          if (nE !== -1) b[nE] += Ieq_ce;
        } else {
          // Saturation: BE diode + low CE resistance
          const Gbe = 1 / 1000;
          this.stampConductance(G, nB, nE, Gbe);
          const Ieq_be = Gbe * 0.6;
          if (nB !== -1) b[nB] -= Ieq_be;
          if (nE !== -1) b[nE] += Ieq_be;
          this.stampConductance(G, nC, nE, 1 / 50); // Rsat = 50 ohm
        }
      }

      // LM741 Op-Amp: high impedance inputs (stabilize matrix)
      if (comp.type === 'lm741') {
        const netInv = this.getNetForPin(comp.id, comp.pins[1].id);    // IN-
        const netNonInv = this.getNetForPin(comp.id, comp.pins[2].id); // IN+
        const nInv = netInv !== -1 ? (this.netToNode[netInv] ?? -1) : -1;
        const nNonInv = netNonInv !== -1 ? (this.netToNode[netNonInv] ?? -1) : -1;
        // Small conductance to ground prevents floating nodes
        const Gin = 1 / 10000000; // 10M ohm input impedance
        if (nInv !== -1) G[nInv][nInv] += Gin;
        if (nNonInv !== -1) G[nNonInv][nNonInv] += Gin;
      }
    }

    // Stamp voltage sources
    for (let i = 0; i < this.vsCount; i++) {
      const vs = this.vsSources[i];
      const row = this.numNodes + i; // extra row for voltage source
      const posN = vs.posNode;
      const negN = vs.negNode; // -1 = ground

      // Stamp into matrix: adds equation V_pos - V_neg = Vs
      if (posN !== -1) {
        G[row][posN] = 1;
        G[posN][row] = 1;
      }
      if (negN !== -1) {
        G[row][negN] = -1;
        G[negN][row] = -1;
      }
      b[row] = vs.voltage;
    }

    // Solve Gx = b using Gaussian elimination with partial pivoting
    const x = this.solve(G, b, N);

    // Extract node voltages
    for (let i = 0; i < this.numNodes; i++) {
      const netId = this.nodeToNet[i];
      const v = x[i];
      this.nodeVoltages[netId] = isFinite(v) ? v : 0;
    }
    // Ground is always 0
    if (this.groundNet !== -1) {
      this.nodeVoltages[this.groundNet] = 0;
    }

    // Update capacitor states for next timestep
    for (const comp of this.components) {
      if (comp.type !== 'capacitor') continue;
      const C = comp.parameters.capacitance || 100e-9;
      const Geq = 2 * C / dt;

      const net0 = this.getNetForPin(comp.id, comp.pins[0].id);
      const net1 = this.getNetForPin(comp.id, comp.pins[1].id);
      const v0 = net0 !== -1 ? (this.nodeVoltages[net0] || 0) : 0;
      const v1 = net1 !== -1 ? (this.nodeVoltages[net1] || 0) : 0;
      const vCap = v0 - v1;

      const state = this.capStates[comp.id];
      // Trapezoidal: I_new = Geq * (V_new - V_prev) - I_prev
      const iCap = Geq * (vCap - state.vPrev) - state.iPrev;
      state.vPrev = vCap;
      state.iPrev = iCap;
    }

    // Update Schmitt trigger states from solved node voltages
    for (const comp of this.components) {
      if (comp.type !== 'cd40106') continue;
      const gates = this.schmittStates[comp.id];
      if (!gates) continue;

      const vddNet = this.getNetForPin(comp.id, comp.pins[12].id);
      const vddActual = vddNet !== -1 ? (this.nodeVoltages[vddNet] || 0) : 0;
      const highThresh = vddActual * 0.66;
      const lowThresh = vddActual * 0.33;

      for (let g = 0; g < 6; g++) {
        const inNet = this.getNetForPin(comp.id, comp.pins[g].id);
        const vIn = inNet !== -1 ? (this.nodeVoltages[inNet] || 0) : 0;

        if (gates[g] && vIn > highThresh) {
          gates[g] = false; // output goes LOW
        } else if (!gates[g] && vIn < lowThresh) {
          gates[g] = true;  // output goes HIGH
        }
      }
    }

    // Read audio output
    for (const comp of this.components) {
      if (comp.type === 'audio-output') {
        const net = this.getNetForPin(comp.id, comp.pins[0].id);
        const v = net !== -1 ? (this.nodeVoltages[net] || 0) : 0;
        const sample = (v / vdd) * 2 - 1;
        return Math.max(-1, Math.min(1, sample));
      }
    }

    return 0;
  }

  // Stamp conductance g between nodes n1 and n2
  // n1, n2 can be -1 (ground)
  stampConductance(G, n1, n2, g) {
    if (n1 !== -1) G[n1][n1] += g;
    if (n2 !== -1) G[n2][n2] += g;
    if (n1 !== -1 && n2 !== -1) {
      G[n1][n2] -= g;
      G[n2][n1] -= g;
    }
  }

  // Gaussian elimination with partial pivoting
  solve(A, b, N) {
    // Augment matrix
    const M = new Array(N);
    for (let i = 0; i < N; i++) {
      M[i] = new Float64Array(N + 1);
      for (let j = 0; j < N; j++) M[i][j] = A[i][j];
      M[i][N] = b[i];
    }

    // Forward elimination
    for (let col = 0; col < N; col++) {
      // Partial pivoting
      let maxRow = col;
      let maxVal = Math.abs(M[col][col]);
      for (let row = col + 1; row < N; row++) {
        const val = Math.abs(M[row][col]);
        if (val > maxVal) { maxVal = val; maxRow = row; }
      }
      if (maxRow !== col) {
        const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp;
      }

      const pivot = M[col][col];
      if (Math.abs(pivot) < 1e-15) continue; // singular

      for (let row = col + 1; row < N; row++) {
        const factor = M[row][col] / pivot;
        for (let j = col; j <= N; j++) {
          M[row][j] -= factor * M[col][j];
        }
      }
    }

    // Back substitution
    const x = new Float64Array(N);
    for (let i = N - 1; i >= 0; i--) {
      let sum = M[i][N];
      for (let j = i + 1; j < N; j++) {
        sum -= M[i][j] * x[j];
      }
      const diag = M[i][i];
      x[i] = Math.abs(diag) > 1e-15 ? sum / diag : 0;
    }

    return x;
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

        // Sample probe voltages
        for (let p = 0; p < this.probes.length; p++) {
          const probe = this.probes[p];
          const net = this.getNetForPin(probe.componentId, probe.pinId);
          this.probeSampleBuffers[p][i] = net !== -1 ? (this.nodeVoltages[net] || 0) : 0;
        }
      } else {
        channel[i] = 0;
        for (let p = 0; p < this.probes.length; p++) {
          this.probeSampleBuffers[p][i] = 0;
        }
      }
    }

    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(channel);
    }

    // Post data back for oscilloscope
    if (this.running && this.components.length > 0) {
      const msg = { type: 'samples', samples: channel.slice() };
      // Include probe data if probes exist
      if (this.probes.length > 0) {
        msg.probeData = this.probeSampleBuffers.map(buf => buf.slice());
      }
      this.port.postMessage(msg);

      // Post LED states at ~60Hz
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
