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
    this._pinCache = null; // Invalidate pin cache
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
    this.dcBlocker = { xPrev: 0, yPrev: 0 };
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

    // Op-amp: not yet modeled as active element in the matrix.
    // Input impedance is stamped during step(). Output node floats.
    // TODO: implement proper ideal op-amp MNA constraint with saturation handling.
    this.opampSources = [];

    this.matrixSize = this.numNodes + this.vsCount;
  }

  // --- MNA Solver with Newton-Raphson ---

  // Helper: get MNA node index for a component pin (-1 = ground)
  nodeForPin(comp, pinIdx) {
    const net = this.getNetForPin(comp.id, comp.pins[pinIdx].id);
    return net !== -1 ? (this.netToNode[net] ?? -1) : -1;
  }

  // Helper: get voltage at a component pin from current guess
  voltageAt(net) {
    return net !== -1 ? (this.nodeVoltages[net] || 0) : 0;
  }

  // Shockley diode: linearize I = Is*(exp(Vd/Vt)-1) at operating point Vd0
  // Returns { Gd, Ieq } where Gd is conductance and Ieq is companion current
  linearizeDiode(vd0) {
    const Is = 2.52e-9;  // 1N914 saturation current
    const Vt = 0.026;    // Thermal voltage at room temp
    const VMAX = 0.8;    // Clamp to prevent exp overflow

    const vd = Math.min(vd0, VMAX);
    const expVd = Math.exp(vd / Vt);
    const Id = Is * (expVd - 1);
    const Gd = (Is / Vt) * expVd;  // dI/dV at operating point
    // Companion: linearized I = Gd*Vd + (Id - Gd*vd)
    // In MNA: stamp Gd as conductance, Ieq = Id - Gd*vd as current source
    const Ieq = Id - Gd * vd;
    // Ensure minimum conductance for numerical stability
    return { Gd: Math.max(Gd, 1e-12), Ieq };
  }

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
    }

    // Pre-cache component pin node indices (avoids repeated lookups in NR loop)
    if (!this._pinCache) {
      this._pinCache = {};
      for (const comp of this.components) {
        const cache = {};
        for (let i = 0; i < comp.pins.length; i++) {
          const net = this.getNetForPin(comp.id, comp.pins[i].id);
          cache['n' + i] = net !== -1 ? (this.netToNode[net] ?? -1) : -1;
          cache['net' + i] = net;
        }
        this._pinCache[comp.id] = cache;
      }
    }

    // ===== Newton-Raphson iteration loop =====
    // Use 1 iteration for speed (ideal op-amp is linear, diode/transistor
    // linearize from previous timestep). Increase for more accuracy.
    const MAX_NR_ITER = 1;
    const NR_TOL = 1e-4;

    for (let nrIter = 0; nrIter < MAX_NR_ITER; nrIter++) {

      // Build G matrix and b vector fresh each iteration
      const G = new Array(N);
      const b = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        G[i] = new Float64Array(N);
      }

      // --- Stamp linear components (same every iteration) ---
      for (const comp of this.components) {
        const pc = this._pinCache[comp.id];

        if (comp.type === 'resistor') {
          const R = Math.max(comp.parameters.resistance || 1000, 1);
          this.stampConductance(G, pc.n0, pc.n1, 1 / R);
        }

        if (comp.type === 'potentiometer') {
          const maxR = comp.parameters.maxResistance || 1000000;
          const pos = Math.max(0.001, Math.min(0.999, comp.parameters.position || 0.5));
          if (pc.n1 !== -1) {
            this.stampConductance(G, pc.n0, pc.n1, 1 / (maxR * pos));
            this.stampConductance(G, pc.n1, pc.n2, 1 / (maxR * (1 - pos)));
          } else {
            this.stampConductance(G, pc.n0, pc.n2, 1 / (maxR * Math.max(0.01, pos)));
          }
        }

        // Capacitor: trapezoidal companion model (linear per timestep)
        if (comp.type === 'capacitor') {
          const C = comp.parameters.capacitance || 100e-9;
          const Geq = 2 * C / dt;
          const state = this.capStates[comp.id] || { vPrev: 0, iPrev: 0 };
          this.stampConductance(G, pc.n0, pc.n1, Geq);
          const Ieq = Geq * state.vPrev + state.iPrev;
          if (pc.n0 !== -1) b[pc.n0] += Ieq;
          if (pc.n1 !== -1) b[pc.n1] -= Ieq;
        }

        // --- Nonlinear: 1N914 Diode (Shockley, linearized at current guess) ---
        if (comp.type === '1n914') {
          const vA = this.voltageAt(pc.net0);
          const vK = this.voltageAt(pc.net1);
          const vd = vA - vK;
          const { Gd, Ieq } = this.linearizeDiode(vd);
          this.stampConductance(G, pc.n0, pc.n1, Gd);
          // Companion current source (positive = into anode)
          if (pc.n0 !== -1) b[pc.n0] -= Ieq;
          if (pc.n1 !== -1) b[pc.n1] += Ieq;
        }

        // --- Nonlinear: 2N3904 NPN Transistor (Ebers-Moll, linearized) ---
        if (comp.type === '2n3904') {
          const vB = this.voltageAt(pc.net0);
          const vC = this.voltageAt(pc.net1);
          const vE = this.voltageAt(pc.net2);
          const vbe = vB - vE;
          const vbc = vB - vC;
          const beta_f = 100;
          const alpha_f = beta_f / (beta_f + 1); // ~0.99

          // BE junction diode
          const be = this.linearizeDiode(vbe);
          // BC junction diode (usually reverse biased)
          const bc = this.linearizeDiode(vbc);

          // Stamp BE junction: current from B to E
          this.stampConductance(G, pc.n0, pc.n2, be.Gd);
          if (pc.n0 !== -1) b[pc.n0] -= be.Ieq;
          if (pc.n2 !== -1) b[pc.n2] += be.Ieq;

          // Stamp BC junction: current from B to C
          this.stampConductance(G, pc.n0, pc.n1, bc.Gd);
          if (pc.n0 !== -1) b[pc.n0] -= bc.Ieq;
          if (pc.n1 !== -1) b[pc.n1] += bc.Ieq;

          // Collector current source: Ic = alpha_f * Ibe - Ibc
          // Linearized: Ic = alpha_f * (be.Gd * Vbe + be.Ieq) - (bc.Gd * Vbc + bc.Ieq)
          // VCCS from BE controlling C-E: Gm = alpha_f * be.Gd
          const Gm = alpha_f * be.Gd;
          if (pc.n1 !== -1 && pc.n0 !== -1) G[pc.n1][pc.n0] += Gm;  // C += Gm*Vb
          if (pc.n1 !== -1 && pc.n2 !== -1) G[pc.n1][pc.n2] -= Gm;  // C -= Gm*Ve
          if (pc.n2 !== -1 && pc.n0 !== -1) G[pc.n2][pc.n0] -= Gm;  // E -= Gm*Vb
          if (pc.n2 !== -1) G[pc.n2][pc.n2] += Gm;                   // E += Gm*Ve
          // Companion current from BE offset
          const Ic_eq = alpha_f * be.Ieq;
          if (pc.n1 !== -1) b[pc.n1] -= Ic_eq;
          if (pc.n2 !== -1) b[pc.n2] += Ic_eq;
        }

        // --- LM741 Op-Amp: high input impedance ---
        if (comp.type === 'lm741') {
          const Gin = 1e-7; // 10M ohm
          if (pc.n1 !== -1) G[pc.n1][pc.n1] += Gin;
          if (pc.n2 !== -1) G[pc.n2][pc.n2] += Gin;
        }
      }

      // --- Stamp voltage sources ---
      for (let i = 0; i < this.vsCount; i++) {
        const vs = this.vsSources[i];
        const row = this.numNodes + i;
        const posN = vs.posNode;
        const negN = vs.negNode;

        // Standard voltage source stamp
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

      // --- Solve Gx = b ---
      const x = this.solve(G, b, N);

      // Check convergence: max voltage change from previous iteration
      let maxDelta = 0;
      for (let i = 0; i < this.numNodes; i++) {
        const netId = this.nodeToNet[i];
        const vNew = isFinite(x[i]) ? x[i] : 0;
        const vOld = this.nodeVoltages[netId] || 0;
        maxDelta = Math.max(maxDelta, Math.abs(vNew - vOld));
        this.nodeVoltages[netId] = vNew;
      }
      if (this.groundNet !== -1) {
        this.nodeVoltages[this.groundNet] = 0;
      }

      // Converged? (skip check on first iteration)
      if (nrIter > 0 && maxDelta < NR_TOL) break;

    } // end NR loop

    // --- Post-solve state updates ---

    // Update capacitor states
    for (const comp of this.components) {
      if (comp.type !== 'capacitor') continue;
      const pc = this._pinCache[comp.id];
      const C = comp.parameters.capacitance || 100e-9;
      const Geq = 2 * C / dt;
      const v0 = this.voltageAt(pc.net0);
      const v1 = this.voltageAt(pc.net1);
      const vCap = v0 - v1;
      const state = this.capStates[comp.id];
      const iCap = Geq * (vCap - state.vPrev) - state.iPrev;
      state.vPrev = vCap;
      state.iPrev = iCap;
    }

    // Update Schmitt trigger states
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
        if (gates[g] && vIn > highThresh) gates[g] = false;
        else if (!gates[g] && vIn < lowThresh) gates[g] = true;
      }
    }

    // Read audio output with DC blocker
    for (const comp of this.components) {
      if (comp.type === 'audio-output') {
        const net = this.getNetForPin(comp.id, comp.pins[0].id);
        const v = net !== -1 ? (this.nodeVoltages[net] || 0) : 0;
        if (!this.dcBlocker) this.dcBlocker = { xPrev: 0, yPrev: 0 };
        const alpha = 0.995;
        const y = v - this.dcBlocker.xPrev + alpha * this.dcBlocker.yPrev;
        this.dcBlocker.xPrev = v;
        this.dcBlocker.yPrev = y;
        const sample = y / (vdd * 0.5);
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
