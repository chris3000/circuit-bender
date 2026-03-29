# MNA Component Models: Diode, Transistor, Op-Amp

## Problem

The MNA solver only supports resistors, capacitors, potentiometers, and CD40106 Schmitt triggers. The 1N914 diode, 2N3904 transistor, and LM741 op-amp have UI definitions but no simulation models, making them open circuits. This prevents the full MFOS Weird Sound Generator circuit from working.

## Approach

Linearized companion models — same pattern as the existing capacitor trapezoidal model. Each nonlinear element is re-linearized each timestep into a conductance + current source stamped into the MNA matrix. No Newton-Raphson iteration needed.

## All changes in one file

`public/audio-worklet-processor.js`

Plus restoring the original WSG example in `src/examples/circuits.ts`.

## 1N914 Diode Model

**Piecewise linear companion.** Each timestep, check Vd = V(anode) - V(cathode) from previous solve:

- **Forward biased** (Vd > 0.6V): conductance Gf = 1/10 (Rf = 10 ohm), companion current source Ieq = Gf * 0.6 to model the forward voltage drop
- **Reverse biased** (Vd <= 0.6V): conductance Gr = 1/10000000 (Rr = 10M ohm), no companion current

Stamp conductance between anode and cathode nodes. Stamp companion current source when forward biased.

**Pin mapping:** pin 0 = Anode (A), pin 1 = Cathode (K)

**State:** `diodeStates[compId] = { vPrev: 0 }`

**resetState addition:**
```javascript
if (comp.type === '1n914') {
  this.diodeStates[comp.id] = { vPrev: 0 };
}
```

**Stamping code (in step(), after capacitor stamping):**
```javascript
if (comp.type === '1n914') {
  const state = this.diodeStates[comp.id];
  const netA = this.getNetForPin(comp.id, comp.pins[0].id);
  const netK = this.getNetForPin(comp.id, comp.pins[1].id);
  const nA = netA !== -1 ? (this.netToNode[netA] ?? -1) : -1;
  const nK = netK !== -1 ? (this.netToNode[netK] ?? -1) : -1;
  const vA = netA !== -1 ? (this.nodeVoltages[netA] || 0) : 0;
  const vK = netK !== -1 ? (this.nodeVoltages[netK] || 0) : 0;
  const vd = vA - vK;

  if (vd > 0.6) {
    // Forward biased: low resistance + voltage offset
    const Gf = 1 / 10;
    this.stampConductance(G, nA, nK, Gf);
    // Companion current for 0.6V forward drop
    const Ieq = Gf * 0.6;
    if (nA !== -1) b[nA] -= Ieq;
    if (nK !== -1) b[nK] += Ieq;
  } else {
    // Reverse biased: very high resistance
    const Gr = 1 / 10000000;
    this.stampConductance(G, nA, nK, Gr);
  }

  state.vPrev = vd;
}
```

**Post-solve state update:** Update vPrev from solved node voltages (same location as capacitor state updates).

## 2N3904 NPN Transistor Model

**Linearized Ebers-Moll.** Each timestep, determine operating region from previous Vbe and Vce:

- **Cutoff** (Vbe <= 0.6V): All junctions high resistance (10M ohm). No collector current.
- **Active** (Vbe > 0.6V, Vce > 0.2V): Base-emitter forward diode (Rbe = 1k ohm with 0.6V drop). Collector-emitter current source Ic = beta * Ib where beta = 100. Modeled as conductance Gce = beta * Gbe.
- **Saturation** (Vbe > 0.6V, Vce <= 0.2V): Base-emitter forward diode. Collector-emitter low resistance (Rsat = 50 ohm).

**Pin mapping:** pin 0 = Base (B), pin 1 = Collector (C), pin 2 = Emitter (E)

**State:** `transistorStates[compId] = { vbePrev: 0, vcePrev: 0 }`

**resetState addition:**
```javascript
if (comp.type === '2n3904') {
  this.transistorStates[comp.id] = { vbePrev: 0, vcePrev: 0 };
}
```

**Stamping code:**
```javascript
if (comp.type === '2n3904') {
  const state = this.transistorStates[comp.id];
  const netB = this.getNetForPin(comp.id, comp.pins[0].id);
  const netC = this.getNetForPin(comp.id, comp.pins[1].id);
  const netE = this.getNetForPin(comp.id, comp.pins[2].id);
  const nB = netB !== -1 ? (this.netToNode[netB] ?? -1) : -1;
  const nC = netC !== -1 ? (this.netToNode[netC] ?? -1) : -1;
  const nE = netE !== -1 ? (this.netToNode[netE] ?? -1) : -1;
  const vB = netB !== -1 ? (this.nodeVoltages[netB] || 0) : 0;
  const vC = netC !== -1 ? (this.nodeVoltages[netC] || 0) : 0;
  const vE = netE !== -1 ? (this.nodeVoltages[netE] || 0) : 0;
  const vbe = vB - vE;
  const vce = vC - vE;

  if (vbe <= 0.6) {
    // Cutoff: all junctions high resistance
    const Goff = 1 / 10000000;
    this.stampConductance(G, nB, nE, Goff);
    this.stampConductance(G, nC, nE, Goff);
  } else if (vce > 0.2) {
    // Active: BE diode + current-controlled current source
    const Gbe = 1 / 1000; // BE junction conductance
    this.stampConductance(G, nB, nE, Gbe);
    // Forward drop companion current
    const Ieq_be = Gbe * 0.6;
    if (nB !== -1) b[nB] -= Ieq_be;
    if (nE !== -1) b[nE] += Ieq_be;
    // Collector current: Ic = beta * Ib
    // Stamp as voltage-controlled current source: Gm from B-E controlling C-E
    const beta = 100;
    const Gm = beta * Gbe;
    // VCCS stamp: current from C to E proportional to Vbe
    if (nC !== -1 && nB !== -1) G[nC][nB] += Gm;
    if (nC !== -1 && nE !== -1) G[nC][nE] -= Gm;
    if (nE !== -1 && nB !== -1) G[nE][nB] -= Gm;
    if (nE !== -1 && nE !== -1) G[nE][nE] += Gm;
    // Companion current for CE (from BE drop)
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
    const Gsat = 1 / 50;
    this.stampConductance(G, nC, nE, Gsat);
  }

  state.vbePrev = vbe;
  state.vcePrev = vce;
}
```

## LM741 Op-Amp Model

**Clamped VCVS (Voltage-Controlled Voltage Source).** The op-amp output is modeled as a voltage source whose value is updated each timestep:

Vout = clamp(A * (V+ - V-), 0, Vdd)

where A = 100000 (open-loop gain), clamped to supply rails.

This is added to the voltage source list in `buildNodeMap()`, same pattern as Schmitt trigger outputs. The voltage is updated at the start of each `step()` call.

**Pin mapping:** pin 1 = IN- (inverting), pin 2 = IN+ (non-inverting), pin 3 = V-, pin 5 = OUT, pin 6 = V+

**buildNodeMap addition:**
```javascript
for (const comp of this.components) {
  if (comp.type !== 'lm741') continue;
  const outNet = this.getNetForPin(comp.id, comp.pins[5].id);
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
```

**step() voltage update (alongside Schmitt trigger update):**
```javascript
if (vs.type === 'opamp') {
  const comp = this.components.find(c => c.id === vs.compId);
  if (comp) {
    const invNet = this.getNetForPin(comp.id, comp.pins[1].id);
    const nonInvNet = this.getNetForPin(comp.id, comp.pins[2].id);
    const vpNet = this.getNetForPin(comp.id, comp.pins[6].id);
    const vmNet = this.getNetForPin(comp.id, comp.pins[3].id);
    const vInv = invNet !== -1 ? (this.nodeVoltages[invNet] || 0) : 0;
    const vNonInv = nonInvNet !== -1 ? (this.nodeVoltages[nonInvNet] || 0) : 0;
    const vPlus = vpNet !== -1 ? (this.nodeVoltages[vpNet] || 0) : vdd;
    const vMinus = vmNet !== -1 ? (this.nodeVoltages[vmNet] || 0) : 0;
    const gain = 100000;
    const vOut = Math.max(vMinus, Math.min(vPlus, gain * (vNonInv - vInv)));
    vs.voltage = vOut;
  }
}
```

**Input impedance:** The IN+ and IN- pins need high impedance to ground so they don't float. Stamp a small conductance (1/10M ohm) from each input to ground to stabilize the matrix without loading the circuit.

## WSG Example Restoration

After the models work, restore the original WSG circuit with the real components: LM741 mixer, 2N3904 cross-modulation transistor, 1N914 diode. Revert to the original topology from the MFOS schematic.

## Testing

1. Simple diode test: power → resistor → diode → ground. Verify forward current flows, voltage drop ~0.6V.
2. Simple transistor test: base driven through resistor from oscillator output, collector pulls up to VDD through resistor. Verify switching behavior.
3. Op-amp inverting amplifier: input through R1, feedback R2, bias on non-inverting input. Verify gain = -R2/R1.
4. Full WSG circuit: load example, press play, verify continuous audio output with all three pots affecting sound.
