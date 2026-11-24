# Tutorial classes: syllabus and class designs

Date: 2026-11-23. Status: class 1 is built (`src/classes/theLoop.ts`), with
what the app needed first (see "What the app needs" below). Classes 2 to 14
are designs. Their LED figures were measured before the LED model was given
its 5 Ω of series resistance: measure them again when each class is built
(they move by a few percent; class 1's are current).

A course of fourteen classes inside the app that takes someone who has never
built a circuit to the point where they can read, change and build circuits
like the Atari Punk Console, the Step Sequencer and the Weird Sound Generator.

## Who it is for

Someone intelligent and motivated who has never wired anything. They do not
know what voltage is, cannot read a schematic and have never seen a chip. They
learn fast, so the course does not repeat itself, but it never assumes a term
it has not introduced.

## How the course teaches

1. **See or hear it first, explain it after.** Each class starts by building
   something that lights up or makes a sound. The explanation comes once there
   is something on the canvas to point at. Both books do this: Collins puts the
   theory under headings the reader may skip, and Wilson builds before he
   explains.
2. **One circuit, varied.** Collins builds one inverter, one resistor and one
   capacitor, then gets a whole book out of changing one thing at a time. The
   course does the same: the oscillator of class 4 is still there in class 14.
3. **Predict, then try.** Every experiment asks for a guess before the change
   is made. A wrong guess that gets corrected is what the class is for.
4. **Only the formulas that get used.** Seven in the whole course: Ohm's law,
   the divider, R × C, the Schmitt oscillator, the two 555 formulas, amplifier
   gain and a filter's corner.
5. **Every number is true in this app.** The values in the builds and
   experiments below were measured by running each circuit through the app's
   solver (48 kHz, the standard models) on 2026-11-23. Hints for the checks are
   calculated, not measured, and say so.
6. **Something to keep.** Each class ends with a circuit that has a named
   control, so it has a cover, like every example.
7. **Say where the app is kinder than a real circuit.** A floating input, two
   outputs wired together and an LED with no resistor are all harmless here.
   The class says what would happen on a real board.

## Anatomy of a class

Every class has the same parts, in this order.

| Part | What it is |
|---|---|
| Promise | One sentence: what will be on the canvas at the end |
| Build | Numbered steps, one small action each, done on the learner's own canvas. The app can tell when a step is done (the part is there, the two pins are joined) |
| What is going on | The explanation, in a few short paragraphs, after the thing works |
| Try | Experiments, each written as "guess, change, look" with the measured result |
| Check | One goal the app can test by running the learner's circuit: a frequency, a voltage, a light that is on or off. Passing it finishes the class |
| Keep | The finished circuit gets a named control and is saved |
| Words | The new terms, one line each |

A class takes 20 to 40 minutes. It starts from an empty canvas, from what the
previous class kept, or from one of the examples; each class below says which.

## Syllabus

| # | Class | You build | New parts | New ideas |
|---|---|---|---|---|
| **Unit 1** | **Light** | | | |
| 1 | The loop | A switched light | supply, ground, resistor, LED, switch | circuit, voltage, current, resistance, Ohm's law |
| 2 | Sharing voltage | A light meter and a dimmer | pot, photocell, body contacts | series, parallel, the divider, sensors |
| 3 | Storing charge | A light that fades | capacitor, push button | charge, R × C, time |
| **Unit 2** | **Sound** | | | |
| 4 | The simplest oscillator | A blinker that becomes a tone | CD40106, Audio Out | chips, inverter, thresholds, feedback, frequency |
| 5 | Playing it | Pitch from a knob, light and skin | | variable resistance, range, volume |
| 6 | More voices | A chord, and one oscillator switching another | 1N914 diode | mixing, intervals, LFO, one-way current |
| **Unit 3** | **Logic and rhythm** | | | |
| 7 | Gates | A key, a beeper | CD4093 | logic, enable, pull-down |
| 8 | Counting | A binary counter and an octave stack | CD4040 | dividing by two, octaves, subdivisions |
| 9 | The 555 | A timer, a siren, the Atari Punk Console | NE555 | astable, one-shot, control by voltage |
| 10 | Steps | A chaser and a sequencer | CD4017 | one-of-ten, reset, sequence |
| **Unit 4** | **Bigger sound** | | | |
| 11 | A small current controls a big one | A touch lamp, a night light | 2N3904, speaker | transistor as a switch, loads |
| 12 | Amplifiers | A mixer and a speaker amp | LM741, LM386 | gain, feedback, half supply, clipping |
| 13 | Tone | A tone knob and a resonant filter | | harmonics, low-pass, high-pass, resonance |
| **Unit 5** | **Your own instrument** | | | |
| 14 | Bending, and the Weird Sound Generator | Your own instrument | bend tool, starve | reading a big circuit, bending |

Which examples each class makes readable:

| After class | The learner can rebuild |
|---|---|
| 4 | LED Blinker, Simple Oscillator, Low Drone, High Chirp |
| 5 | Pitch Control |
| 7 | Light Theremin |
| 9 | Atari Punk Console |
| 10 | Step Sequencer |
| 12 | Oscillator + Op-Amp, Octave Organ |
| 14 | MFOS Weird Sound Generator |

---

## Unit 1: Light

### Class 1: The loop

**Promise.** A light with a switch, and the reason it needs every part it has.

**Starts from** an empty canvas. This class also teaches the app: dragging
parts from the shelf, wiring pin to pin, play, the three views, the inspector.

**Build.**
1. Put down a supply and a ground. Wire the supply's − to ground.
2. Add a switch, a 470 Ω resistor and an LED.
3. Wire + to the switch, the switch to the resistor, the resistor to the LED's
   A leg, the LED's K leg to ground.
4. Press play and close the switch. The LED lights.

**What is going on.**
- Current only flows round a complete loop. Open the switch and the loop is
  broken everywhere at once.
- Voltage is the push, and it is always between two points. Ground is the
  point everything is measured from, so "9 V" means 9 V above ground.
- Current is the flow. In a single loop it is the same at every point.
- A resistor holds the flow back. Ohm's law: current = voltage ÷ resistance.
- An LED is a one-way part that takes about 2 V for itself. The resistor gets
  what is left: (9 − 2.2) ÷ 470 = 14.5 mA.

**Try.**
- *Turn the LED round.* Dark. All 9 V now sits across the LED and nothing flows.
- *Change the resistor.* 1 kΩ gives 6.9 mA, 4.7 kΩ gives 1.5 mA, 47 kΩ gives
  0.15 mA. The LED's own voltage hardly moves (2.2 V down to 1.9 V): the
  resistor decides the current.
- *Add a second LED in line.* Each takes its 2 V, the resistor is left with
  less (4.8 V), and the current falls to 10.1 mA.
- *Take the resistor out.* 1.33 A flows, where the LED is built for 0.02 A.
  The app marks the LED and the supply with a "!"; on a real board the LED
  burns out in an instant. Rule for the whole course: an LED always has a
  resistor in line.

**Check.** Run the LED at 2 mA (between 1.8 and 2.2 mA). *Hint, calculated:*
about 3.3 kΩ (measured: 2.12 mA).

**Keep.** The light, with its switch named LIGHT.

**Words.** Circuit, loop, voltage, ground, current, milliamp, resistance, ohm,
LED, anode and cathode.

### Class 2: Sharing voltage

**Promise.** A meter that reads light as a voltage, and a lamp dimmed by light
and by a finger.

**Starts from** an empty canvas.

**Build.**
1. Two 10 kΩ resistors in a line from + to ground. Probe the point between
   them: 4.5 V.
2. Replace the pair with a 10 kΩ pot, its outer legs on + and ground. Probe
   the middle leg and turn it: 0 V to 9 V, 2.25 V at a quarter turn.
3. Light meter: a photocell from + to the probe point, 10 kΩ from there to
   ground.
4. Dimmer: a photocell, 470 Ω and an LED in one line from + to ground.

**What is going on.**
- Resistors in a line add up, and they share the voltage in proportion to
  their size. The point between them sits at
  V × bottom ÷ (top + bottom). This is a voltage divider, and almost every
  later class uses one.
- Resistors side by side give the current two ways through, so together they
  are less than the smaller of the two.
- A pot is a divider on a shaft: one strip of resistance and a contact that
  slides along it.
- A sensor is a resistor that something changes. The photocell is about 1 MΩ
  in the dark and 1 kΩ in bright light. Skin between two contacts is 2 MΩ for
  a light touch and 50 kΩ pressed hard.

**Try.**
- *Change the bottom resistor to 4.7 kΩ.* 2.88 V. Swap the two: 6.12 V.
- *100 kΩ over 1 kΩ.* 0.09 V. A divider can make a voltage as small as you like.
- *Light meter.* 0.09 V in the dark, 2.16 V at half light, 8.18 V in bright light.
- *Dimmer.* 0.007 mA in the dark, 0.22 mA at half light, 4.7 mA in bright light.
- *Swap the photocell for body contacts.* A light touch passes 5 µA, a hard
  press 140 µA. The LED barely glows: a finger is a resistor, but a large one.
  Class 11 comes back to this.

**Check.** Make a point that sits at 3.0 V (2.9 to 3.1 V) using only 10 kΩ
resistors. *Hint:* resistors in a line add.

**Keep.** The dimmer.

**Words.** Series, parallel, divider, potentiometer, wiper, photocell, kilohm,
megohm.

### Class 3: Storing charge

**Promise.** A light that stays on after you let go, and fades.

**Starts from** class 1's light.

**Build.**
1. From +: a push button, then 100 Ω, to a point we will call the tank.
2. A 100 µF capacitor from the tank to ground.
3. 4.7 kΩ and the LED from the tank to ground.
4. Play. Press: the LED is on (1.45 mA). Let go: it fades.
5. Probe the tank and watch the curve.

**What is going on.**
- A capacitor is a small tank for charge. Pressing the button fills it almost
  at once through the 100 Ω. Letting go leaves it to empty through the 4.7 kΩ
  and the LED.
- Emptying takes time, and the time is resistance × capacitance:
  4,700 Ω × 0.0001 F = 0.47 s. In that time the voltage covers about two thirds
  of the distance it has left to go. It halves every 0.7 × R × C.
- Steady current cannot pass through a capacitor. Only changes get through.
  That matters from class 12 on.

**Try.**
- *Time the fade.* Half brightness 0.33 s after letting go, a tenth after 1.1 s.
- *4.7 kΩ becomes 10 kΩ.* Half at 0.70 s. *100 µF becomes 470 µF.* Half at 1.55 s.
- *100 Ω becomes 10 kΩ.* Now the LED also comes on slowly (about 0.14 s to
  reach 0.1 mA) and settles dimmer, at 0.48 mA: the 10 kΩ and the LED's branch
  are a divider (class 2), and the tank only fills to 4.2 V.

**Check.** Make the LED take two seconds to fall to half (1.7 to 2.3 s).
*Hint, calculated:* R × C of about 2.9, for example 27 kΩ and 100 µF.

**Keep.** The fading light, button named GLOW.

**Words.** Capacitor, farad, microfarad, nanofarad, charge, time constant.

**Note for whoever builds the class.** The app starts a circuit in the state
it would settle to if left alone. A capacitor with no way to empty therefore
starts full, which a real one would not. Every circuit in this class gives the
capacitor a way to empty.

---

## Unit 2: Sound

### Class 4: The simplest oscillator

**Promise.** One chip, one resistor and one capacitor that blink a light, and
then, with nothing changed but the values, play a note.

**Starts from** an empty canvas.

**Build.**
1. Supply, ground, a CD40106. Wire VDD to +, VSS to ground. A chip does
   nothing until its own two power pins are connected.
2. 100 kΩ from 1Y (the output) back to 1A (the input). 10 µF from 1A to ground.
3. 1 kΩ and an LED from 1Y to ground. Play: it blinks about once a second.
4. Probe 1Y and 1A together.

**What is going on.**
- An inverter puts out the opposite of what it is given: input low, output
  high (9 V); input high, output low (0 V).
- This one is a Schmitt trigger: it flips low when its input rises past 5.3 V
  and does not flip back until the input has fallen below 3.6 V.
- The resistor lets the output fill or empty the capacitor on the input
  (class 3). Output high: the capacitor fills, reaches 5.3 V, the output flips
  low. Now the capacitor empties, reaches 3.6 V, the output flips high. It can
  never settle. Collins calls it an argument the chip has with itself.
- On the scope the input ramps between 3.6 V and 5.3 V while the output jumps
  between 0 V and 9 V.
- How often it happens is the frequency, in hertz: about 1.3 ÷ (R × C).

**Try.**
- *Look closely at the blink.* It runs at 1.03 Hz, not 1.3, and is lit 61% of
  the time. The LED is drawing current from the output and pulling its high
  level down to 7.5 V. Fix: wire 1Y to 2A as well, and move the LED to 2Y.
  The second inverter does the work, the first is left alone: 1.30 Hz, lit
  half the time. This is a buffer.
- *10 µF becomes 1 µF.* 13 Hz, a flicker. Add an Audio Out on 2Y: a purr.
- *1 µF becomes 100 nF.* 130 Hz. The clicks have become a low note. Rhythm and
  pitch are the same thing at different speeds.
- *100 kΩ becomes 10 kΩ.* 1,264 Hz.
- *27 kΩ and 2.2 kΩ in a line, with 100 nF.* 441 Hz: the A that orchestras tune to.

**Check.** Play middle C, 262 Hz (254 to 270 Hz). *Hint, calculated:* with
100 nF, about 50 kΩ.

**Keep.** The oscillator, with a switch named SOUND between the chip and the
Audio Out. It is now the Simple Oscillator example.

**Words.** Chip, pin, VDD and VSS, inverter, high and low, threshold, Schmitt
trigger, feedback, oscillator, frequency, hertz, square wave, buffer.

### Class 5: Playing it

**Promise.** The same oscillator played three ways: by a knob, by light and by
touch.

**Starts from** class 4's oscillator.

**Build.**
1. Knob: replace the resistors with 10 kΩ and a 100 kΩ pot in a line, using
   the pot's middle leg and one outer leg. Name the pot PITCH.
2. Light: replace them with a photocell and 4.7 kΩ in a line, and the
   capacitor with 47 nF.
3. Skin: replace them with body contacts alone, and the capacitor with 10 nF.
4. Volume: a 10 kΩ pot from the output to ground, Audio Out on its middle leg.

**What is going on.**
- Pitch is 1.3 ÷ (R × C), so anything that changes R plays the instrument.
- Used with two legs, a pot is a variable resistor.
- The resistor decides where in the range you are; the capacitor decides
  which range. Ten times the capacitance is ten times lower.
- Volume is a divider (class 2) on the output.

**Try.**
- *Knob.* 120 Hz to 1.3 kHz.
- *Take out the 10 kΩ and turn the knob to zero.* Silence. It is running at
  23.5 kHz, above hearing. The fixed resistor is there to set the top note.
- *A second capacitor, 220 nF, beside the first, on a switch named LOW.*
  37 to 400 Hz.
- *Light.* 27 Hz in the dark, 755 Hz at half light, 4.6 kHz in bright light.
- *Skin.* Nothing until touched. A light touch is 78 Hz, a hard press 2.6 kHz.
- *Volume.* The meter reads 0.59 at full, 0.29 at half, 0.15 at a quarter.
  A fixed 10 kΩ over 1 kΩ gives 0.05.

**Check.** A light-played oscillator that never goes below 80 Hz or above
2.5 kHz anywhere between dark and bright. *Hint:* a resistor in line sets the
top; a resistor beside the photocell sets the bottom.

**Keep.** The light-played oscillator, with its switch.

**Words.** Variable resistor, range, octave, level.

### Class 6: More voices

**Promise.** A three-note chord from one chip, then a slow oscillator switching
a fast one on and off.

**Starts from** class 4's oscillator.

**Build.**
1. Three oscillators on inverters 1, 2 and 3, each with 47 nF: 120 kΩ
   (230 Hz), 82 kΩ (336 Hz), and 27 kΩ + 33 kΩ (459 Hz). Roughly a note, the
   fifth above it and its octave.
2. Mix: a 10 kΩ from each output to one shared point, Audio Out on that point.
3. Gating: go back to one voice at 440 Hz (27 kΩ + 2.2 kΩ, 100 nF) on
   inverter 1. Make inverter 2 a slow oscillator: 1 MΩ and 1 µF, 1.3 Hz.
4. A diode from the voice's input (the diode's A leg) to the slow oscillator's
   output (its K leg).

**What is going on.**
- Each output pushes the shared point towards its own voltage through its
  resistor; the point takes the average. Equal resistors, equal loudness.
- Two notes sound related when their frequencies are in a simple ratio: 2 to 1
  is an octave, 3 to 2 a fifth.
- A diode passes current one way only, from A to K. While the slow output is
  low it drains the voice's capacitor through the diode, the capacitor can
  never reach 5.3 V, and the voice stops. While the slow output is high the
  diode passes nothing and the voice runs: 1.3 bursts a second of 438 Hz.
- A slow oscillator used to control something is an LFO. This diode is exactly
  how the Weird Sound Generator's Wacky oscillator chops its Weird one.

**Try.**
- *Wire two outputs straight together, no resistors.* Silence. Each output
  fights the other, the point between sits at 4.5 V and both oscillators
  stall. On a real board the chip would also get hot. Outputs are only ever
  joined through resistors or diodes.
- *Make one voice's resistor a pot and bring it close to another.* A slow
  throb: the two drift in and out of step. The closer, the slower.
- *Turn the gating diode round.* The voice now sounds while the slow output is
  low and is held silent while it is high.
- *Replace the diode with 47 kΩ.* No silence now: the pitch sags and wobbles
  between 187 Hz and 218 Hz.
- *A diode across the voice's resistor, A leg on the output.* 534 Hz, and the
  output is high only 1% of the time: a thin, nasal pulse. Turned round:
  557 Hz, high 99% of the time.
- *Collins's diode mixer.* Three oscillators, one of them slow, each through
  its own diode to a shared point; 10 kΩ and 10 kΩ from there to ground, Audio
  Out between the two. The notes are no longer separate: the slow oscillator
  seems to switch the fast ones on and off.

**Check.** Two voices a fifth apart (ratio 1.45 to 1.55), both switched on and
off together about twice a second by a third oscillator.

**Keep.** The chord, with a switch named FIFTH in line with the middle
voice's mixing resistor.

**Words.** Mix, interval, fifth, beating, LFO, gate, diode, pulse.

---

## Unit 3: Logic and rhythm

### Class 7: Gates

**Promise.** An oscillator with a key, then one that beeps by itself.

**Starts from** an empty canvas.

**Build.**
1. A CD4093 with VDD and VSS wired. Gate 1 as an oscillator: 100 kΩ from Y1
   to B1, 10 nF from B1 to ground. Audio Out on Y1.
2. A push button from + to A1, and 100 kΩ from A1 to ground. Name the button
   PLAY. Held: 1,296 Hz. Released: silence.
3. Gate 2 as a slow oscillator: A2 to +, 470 kΩ from Y2 to B2, 1 µF from B2 to
   ground. Take the button away and wire Y2 to A1: 2.8 beeps a second.

**What is going on.**
- A NAND gate's output is low only when both inputs are high. Hold one input
  high and the gate is an inverter for the other, so it can oscillate. Hold
  that input low and the output is stuck high: silence.
- That input is an enable: a signal that says whether something else may run.
- The 100 kΩ to ground is a pull-down. It gives the input a definite level
  while the button is open.
- One oscillator enabling another is the gating of class 6 without the diode.

**Try.**
- *Take the pull-down away.* The note never stops. In the app the open button
  leaves the input reading high. On a real board an input with nothing driving
  it drifts and picks up hum, and the chip may do anything. An input is always
  connected to something.
- *470 kΩ becomes 1 MΩ.* 1.3 beeps a second. *100 kΩ.* 13 a second: too fast to
  hear as beeps, it has become a rough new tone. Tempo turns into timbre.
- *A third gate, slower still, enabling the second.* Bursts of beeps.
- *Load the Light Theremin example.* Find the gate, the enable, the pull-down
  and the two ways of holding the enable high.

**Check.** A metronome: bursts of a tone above 800 Hz, between 1.8 and 2.2 of
them a second.

**Keep.** The beeper, with a switch named BEEP in the wire from Y2 to A1 and
100 kΩ from A1 to + (a pull-up). Closed: 2.75 beeps a second. Open: a steady
tone.

**Words.** Logic, gate, NAND, enable, pull-down, floating input.

### Class 8: Counting

**Promise.** A chip that counts in binary on four lights, then turns one note
into a stack of octaves.

**Starts from** class 4's oscillator.

**Build.**
1. Oscillator at 13 Hz (100 kΩ, 1 µF). A CD4040 with VDD and VSS wired and RST
   to ground. Oscillator output to CLK.
2. 1 kΩ and an LED from each of Q1, Q2, Q3 and Q4 to ground. They count from
   0000 to 1111 and start again.
3. Speed the oscillator up to 4.4 kHz (27 kΩ + 2.2 kΩ, 10 nF). Listen to Q1,
   Q2, Q3 and Q4 in turn.
4. Mix Q2, Q3 and Q4 through 100 kΩ each into the Audio Out.

**What is going on.**
- Inside is a chain of twelve stages. Each one changes state once for every
  full cycle of the stage before, so it runs at half the speed.
- Half the frequency is one octave down. Q1 is 2,204 Hz, Q2 1,102 Hz, Q3
  551 Hz, Q4 276 Hz.
- Slowed down, the same outputs are the digits of a binary number, and the
  subdivisions of a beat.
- The count moves on when CLK falls. RST high holds everything at zero, which
  is why it must be wired to ground.

**Try.**
- *Mix octaves.* It does not sound like three notes. It sounds like one note
  with a different colour: octaves fuse.
- *Put a switch in one of the mixing resistors.* The Octave Organ's BASS switch.
- *Take RST off ground and put it on Q4.* The count never gets past seven.
- *Load the Octave Organ.* Everything before the LM386 is this class.

**Check.** Two lights from one oscillator: one blinks once a second (0.9 to
1.1 Hz), the other exactly four times as fast.

**Keep.** The octave stack, switch named BASS.

**Words.** Clock, counter, divider, binary, reset, edge.

### Class 9: The 555

**Promise.** A timer chip three ways: a blinker, a light that stays on for
exactly as long as you say, and a siren. Then the Atari Punk Console.

**Starts from** an empty canvas.

**Build.**
1. Blinker. NE555 with VCC and RESET to +, GND to ground. 10 kΩ from + to
   DISCH, 100 kΩ from DISCH to THRES, THRES joined to TRIG, 4.7 µF from there
   to ground. 1 kΩ and an LED from OUT to ground. 1.46 Hz.
2. Tone. Change to 47 kΩ and 10 nF, and put an Audio Out on OUT. 1,384 Hz.
3. One-shot. A fresh 555: 100 kΩ from + to DISCH and THRES joined, 10 µF from
   there to ground. 10 kΩ from + to TRIG, a push button from TRIG to ground.
   LED on OUT. Tap the button: the LED stays on for 1.10 s.
4. Siren. Back to the tone. A slow CD40106 oscillator (1 MΩ, 1 µF) through
   10 kΩ into CTRL. The tone jumps between 1,180 Hz and 1,780 Hz.

**What is going on.**
- The 555 is the oscillator of class 4 with the parts made visible. It lets
  its capacitor fill through both resistors to two thirds of the supply (6 V),
  then empties it through the second resistor to one third (3 V).
- Running free: frequency = 1.44 ÷ ((RA + 2 × RB) × C).
- As a one-shot it waits. A dip on TRIG starts one fill of the capacitor, and
  OUT stays high until it is done: 1.1 × R × C.
- CTRL is the 6 V level itself. Push it up or down from outside and the
  capacitor has further or less far to travel, so the pitch moves. A voltage is
  now setting a pitch. Every synthesizer oscillator is built on that idea.
- Its output is stronger than a CMOS chip's and can drive a small speaker.

**Try.**
- *One-shot with 47 kΩ.* 0.52 s.
- *Siren resistor: 4.7 kΩ.* 1,048 and 2,028 Hz. *47 kΩ.* 1,330 and 1,491 Hz.
  The smaller the resistor, the more say the slow oscillator has.
- *Ground RESET on the tone.* It stops, output low. RESET is the 555's enable.
- *Load the Atari Punk Console.* The first 555 is the tone of step 2. The
  second is the one-shot of step 3, set off by every cycle of the first. Work
  out what WIDTH does before turning it.

**Check.** A doorbell: silent until the button is tapped, then a tone between
600 and 800 Hz for about a second (0.9 to 1.2 s), then silent. One way does
ring at 686 Hz in the app.

**Keep.** The siren, with a switch named WAIL in the line to CTRL.

**Words.** Timer, astable, one-shot, trigger, control voltage.

### Class 10: Steps

**Promise.** Four lights that chase, then four notes that play themselves.

**Starts from** class 9's tone.

**Build.**
1. A CD40106 clock: 470 kΩ and 1 µF, 2.8 Hz. A CD4017 with VDD and VSS wired,
   INH and RST to ground, clock into CLK.
2. 1 kΩ and an LED from each of Q0 to Q3 to ground. One lights at a time, then
   six steps of darkness.
3. Take RST off ground and wire it to Q4. Four steps, round and round.
4. From Q0 to Q3, resistors of 4.7 kΩ, 10 kΩ, 6.8 kΩ and 15 kΩ, all to the
   CTRL pin of a 555 tone (47 kΩ from + to DISCH, 4.7 kΩ from DISCH to THRES,
   100 nF).

**What is going on.**
- The CD4017 has ten outputs and exactly one is high. Each rising clock edge
  hands the turn to the next.
- Wiring an output to RST sends the count back to zero the moment that output
  comes up, so the loop is as long as you choose.
- Each output, when it is high, pulls CTRL up through its own resistor by its
  own amount (class 9), and that is the note for that step: 417, 603, 514 and
  683 Hz.
- The clock is the tempo. Everything in this circuit has been met before.

**Try.**
- *Change one step's resistor.* You are composing.
- *Put 2.2 kΩ and an LED from Q0 to ground.* The first note rises from 417 Hz
  to 440 Hz. The LED pulls Q0's voltage down a little, as it did to the
  blinker in class 4. The Step Sequencer example is tuned with its LED in place.
- *Make the clock's resistor a pot.* TEMPO.
- *Put a switch in the RST wire, with 100 kΩ from RST to ground.* SHORT: four
  steps or ten.
- *Light one LED on steps 1 and 3.* Two outputs must not be wired together
  (class 6). A diode from each to the LED's resistor joins them safely.
- *Load the Step Sequencer* and find each of these.

**Check.** An eight-step loop at about four steps a second (3.5 to 4.5) in
which one LED lights on the first and fifth steps only.

**Keep.** The sequencer, with SHORT and TEMPO.

**Words.** Step, sequence, tempo, decade counter.

---

## Unit 4: Bigger sound

### Class 11: A small current controls a big one

**Promise.** A lamp you switch on with a fingertip, and a light that comes on
when it gets dark.

**Starts from** class 2's dimmer.

**Build.**
1. Touch lamp. A 2N3904. E to ground. From +: 470 Ω, an LED, then C. From +:
   body contacts, 10 kΩ, then B.
2. Night light. Take the body contacts out. 100 kΩ from + to a meeting point,
   a photocell from the meeting point to ground, 10 kΩ from the meeting point
   to B.

**What is going on.**
- A transistor has three legs. A small current into the base (B) lets a much
  larger one flow from collector (C) to emitter (E). Here it is a few hundred
  times larger.
- In class 2 a finger alone lit the LED with at most 0.14 mA. Now a light
  touch passes 6 µA into the base and the LED gets 2.5 mA. Pressed hard, the
  transistor is fully on and the resistor limits the LED to 14 mA.
- Base to emitter is a diode: nothing happens until the base is about 0.6 V
  above the emitter. In the night light, bright light makes the photocell
  small, the divider holds the base below that, and the LED is off.
- Used like this a transistor is a switch that a voltage can work.

**Try.**
- *Night light, light falling.* Off above 0.75 on the light slider, 0.5 mA at
  0.7, 8 mA at 0.6, fully on (14 mA) below 0.5.
- *Swap the photocell and the 100 kΩ.* Now it lights in the light: 12 mA at a
  quarter light. In the dark it dims to 0.7 mA but does not go out. A dark
  photocell is 1 MΩ, and 1 MΩ over 100 kΩ still leaves the base 0.8 V.
- *A speaker straight on a chip.* Class 4's 440 Hz oscillator, 100 µF from 1Y
  to a speaker, speaker to ground. Barely audible (level 0.025), and the pitch
  has collapsed to 34 Hz. The speaker is 8 Ω; the chip's output cannot hold its
  voltage against it and only moves between 3.2 V and 5.7 V. This is the LED
  problem of class 4, a thousand times worse.
- *Give it a transistor.* 1Y through 10 kΩ to B, E to ground, speaker and
  100 Ω in a line from + to C. A note again (430 Hz) and nearly twice the
  level (0.044). The chip only has to supply the base.
- *In the Weird Sound Generator,* find the transistor. It is a switch across
  part of a pitch control, worked by another oscillator.

**Check.** A night light that blinks: off in bright light, flashing between
one and three times a second in the dark.

**Keep.** The night light, with a switch named ALWAYS that takes the photocell
out of the circuit.

**Words.** Transistor, base, collector, emitter, gain, load.

### Class 12: Amplifiers

**Promise.** A mixer that does not distort, and a signal strong enough for a
speaker.

**Starts from** class 6's chord.

**Build.**
1. An LM741: V+ to +, V− to ground. Two 100 kΩ from + to ground, their
   meeting point to IN+. This is half the supply, 4.5 V.
2. One 440 Hz voice through 1 µF and then 100 kΩ to IN−. 22 kΩ from OUT back
   to IN−. Audio Out on OUT. The output is a copy 1.96 V tall, standing on 4.5 V.
3. Mixer: a second voice through its own 100 kΩ to IN−.
4. An LM386: VS to +, GND and IN− to ground. Cut one voice down with 100 kΩ
   over 1 kΩ and feed the meeting point to IN+. 220 µF from OUT to a speaker,
   speaker to ground.

**What is going on.**
- An op-amp with a resistor from its output back to IN− moves its output to
  whatever keeps its two inputs at the same voltage. Wilson's whole chapter on
  op-amps rests on that one sentence.
- IN+ is held at 4.5 V, so IN− stays at 4.5 V. Whatever current the input
  resistor brings must leave through the feedback resistor, so the output
  moves by input × (feedback ÷ input resistor), upside down. That ratio is the
  gain: 22 kΩ ÷ 100 kΩ = 0.22.
- Because IN− never moves, the two voices of the mixer cannot disturb each
  other. That is the advantage over class 6's resistors.
- With only one supply, "zero" for the signal has to be in the middle, which
  is what the two 100 kΩ are for. The 1 µF lets the signal through and keeps
  each side's steady voltage to itself (class 3).
- The LM386 is an amplifier with its resistors inside, a fixed gain of 20, and
  the strength to drive 8 Ω.

**Try.**
- *Feedback 47 kΩ.* 4.20 V tall: gain 0.47. *100 kΩ.* It should be 9 V tall,
  and is 6.0 V with flat tops at 1.49 V and 7.51 V. The LM741 cannot get
  closer than that to either side of its supply. This is clipping.
- *Mixer with 22 kΩ feedback.* 2.54 V to 6.46 V, clean. *With 47 kΩ.* Clipped:
  two voices need twice the room.
- *No feedback at all.* A photocell over 10 kΩ on IN+, two 10 kΩ making 4.5 V
  on IN−, 1 kΩ and an LED on OUT. The LED is off until the light slider passes
  about 0.67, then the output jumps from 1.5 V to 7.1 V. Compare the night
  light of class 11, which came on gradually. This is a comparator.
- *Build a Schmitt trigger.* Three 100 kΩ meeting on IN+: from +, from ground
  and from OUT. 100 kΩ from OUT to IN−, 100 nF from IN− to ground. It
  oscillates at 68 Hz, with thresholds at 3.42 V and 5.58 V. This is what is
  inside the CD40106.
- *LM386.* 0.09 V in, 1.6 V out (4.58 V to 6.17 V), level 0.12 at the speaker:
  five times the bare chip of class 11, at the right pitch. With 10 kΩ over
  1 kΩ the input is 0.78 V and the output flattens at 7.87 V.
- *Load Oscillator + Op-Amp* and work out what SOFT does to the gain.

**Check.** The class 6 chord, mixed by an op-amp whose output stays between
1.6 V and 7.4 V, then through an LM386 into a speaker at a level above 0.1.

**Keep.** The chord with its amplifier, and a switch named SOFT that puts a
second 1 kΩ beside the lower resistor of the LM386's input divider.

**Words.** Amplifier, gain, op-amp, feedback, half supply, coupling capacitor,
clipping, comparator.

### Class 13: Tone

**Promise.** A tone knob, and a filter that sings.

**Starts from** class 4's oscillator at 440 Hz, buffered through a second
inverter as in that class.

**Build.**
1. Low-pass: 10 kΩ from the buffer's output to a meeting point, a capacitor
   from the meeting point to ground, Audio Out on the meeting point. Start
   with 10 nF.
2. Tone knob: replace the 10 kΩ with 1 kΩ and a 100 kΩ pot in a line, and use
   47 nF.
3. High-pass: swap the two parts. Capacitor first, 10 kΩ to ground.
4. Resonant filter, the Weird Sound Generator's ODDNESS on its own. Slow the
   oscillator to 108 Hz (120 kΩ, 100 nF). Cut it down with 1 MΩ over 1 kΩ, then
   100 nF and 750 kΩ into IN− of an LM741 on half supply (class 12, with
   220 µF across the lower 100 kΩ). 10 MΩ from OUT to IN−. Two 470 pF in a line
   beside the 10 MΩ. From the point between them, a 1 MΩ pot and 1 kΩ in a
   line to the half-supply point. OUT through 1 kΩ and 1 µF to the Audio Out,
   trim 8.

**What is going on.**
- A square wave is a pure tone at its own frequency plus weaker ones at 3, 5,
  7 … times that frequency: harmonics. Measured here at 0.64, 0.21, 0.13 and
  0.09. The harmonics are the buzz.
- A capacitor takes time to fill (class 3). Through a resistor it cannot keep
  up with fast changes, so the high harmonics are lost and the corners of the
  square are rounded. That is a low-pass filter.
- The other way round, only changes get through the capacitor, so the low
  part is lost. That is a high-pass filter.
- The frequency where a filter starts to bite is its corner:
  1 ÷ (2π × R × C).
- A resonant filter rings at its corner like a struck glass and picks out
  whichever harmonic is nearest. Turning the corner sweeps through the
  harmonics one after another.

**Try.**
- *Low-pass, 10 nF (corner 1.6 kHz).* The third harmonic falls from 0.21 to 0.16.
  *47 nF (340 Hz).* The fundamental is 0.38 and the third 0.05. *100 nF
  (160 Hz).* 0.21 and 0.025: nearly a pure tone, and a third as loud.
  *470 nF.* Almost nothing left.
- *Tone knob.* Bright at one end (third harmonic 0.19), dull and quiet at the
  other.
- *High-pass, 100 nF.* Hardly changed. *10 nF.* The fundamental falls to 0.17
  while the seventh harmonic is still 0.07: thin and bright. *1 nF.* Every
  harmonic the same small size: clicks.
- *Without the buffer.* The filter loads the oscillator and its pitch drops
  from 441 Hz to 430 Hz with 100 nF.
- *Resonant filter, sweeping the pot.* With 1 MΩ in circuit, only the 108 Hz
  fundamental. At 100 kΩ the third harmonic (324 Hz) is louder than the
  fundamental. 47 kΩ picks out 540 Hz, 22 kΩ 756 Hz, 10 kΩ 972 Hz, 4.7 kΩ
  1,404 Hz. The frequency is about 1 ÷ (2π × 470 pF × √(pot × 10 MΩ)).

**Check.** Make the 440 Hz square nearly pure: third harmonic under 15% of the
fundamental, and the level still above 0.2.

**Keep.** The resonant filter, the pot named ODDNESS and a switch named SOUND
between the oscillator and the 1 MΩ.

**Words.** Harmonic, fundamental, timbre, low-pass, high-pass, corner
frequency, resonance.

---

## Unit 5: Your own instrument

### Class 14: Bending, and the Weird Sound Generator

**Promise.** You read the largest circuit in the app, break its rules on
purpose, and then build an instrument of your own.

**Starts from** the Simple Oscillator example, then the MFOS Weird Sound
Generator.

**Part 1: bending.**
1. Simple Oscillator, playing. Switch the bend tool on (BEND, or B). Press on
   one end of the timing resistors and hold on the other end with the 10 kΩ
   jumper: 441 Hz jumps to 1,681 Hz. The jumper is a resistor beside the
   others (class 2).
2. Try the finger jumper, then the wire. Try points you have no reason to try.
3. Turn the supply's STARVE knob. At half way the pitch has risen to 540 Hz.
   At 0.8 the chip is running on 3.9 V, at 555 Hz and less than half as loud.
4. When a bend sounds good, keep it as a switch.

**What is going on.** Bending is finding sounds a circuit was not designed to
make by connecting things that were not meant to be connected, and listening.
Three habits from Collins: change one thing at a time and check it still
works; write down what you liked, because you may not find it again; and if
it sounds good, it is good, whether or not you can explain it yet. On a real
board there is one more: only ever bend something that runs on batteries.

**Part 2: reading the Weird Sound Generator.** Nothing in it is new.

| In the circuit | It is | From class |
|---|---|---|
| Weird, Wacky, Zany | Schmitt oscillators | 4 |
| Their pots | Pitch controls with a resistor in line | 5 |
| The diode from Weird's input to Wacky | Gating | 6 |
| The transistor across Weird's pitch pot, driven by Zany | A switch worked by a voltage | 11 |
| The two 100 kΩ and the 220 µF | Half supply | 12 |
| The 1 MΩ over 1 kΩ before the filter | A divider | 2 |
| ODDNESS and the op-amp | The resonant filter | 13 |
| The 1 µF before the output | A coupling capacitor | 3, 12 |

The learner is asked, for each knob and switch, to say what it will do before
touching it, then to probe the point that proves it.

**Part 3: the instrument.** The brief:
- At least two oscillators, one of which controls the other.
- Something played without a knob: light or touch.
- A gate or a counter.
- A mixer or a filter before the output.
- Every control named, so the cover makes sense to someone else.
- The load indicator stays out of the red.

**Check.** There is no single right answer. The app can check the brief: it
makes sound, the controls are named, each named control changes the sound,
and the load is below 70%.

**Keep.** The instrument, saved and exported as a file.

**Words.** Bend, jumper, starve.

---

## What the app needs before these classes work

Found while measuring the class circuits. In order of how many classes depend
on each. Items 1 to 4 were built with class 1.

1. **LED brightness. Done.** An LED was either lit or not, and counted as lit
   from 1 µA. Now its drawing, on the canvas and the cover, follows its
   current: just visible at a tenth of a milliamp, full at 20 mA.
2. **A meter. Done, except harmonics.** Select a wire while the circuit plays
   and the inspector reads its voltage (and frequency, if it has one). Select
   a part with two legs and it reads the current through it and the voltage
   across it. Each scope probe shows its level, swing and frequency. Still to
   come: the size of a harmonic (class 13).
3. **A slower scope. Done.** Sweeps now go from 1 ms to 1 s a division.
4. **Checks. Done.** A class measures the learner's own circuit on an offline
   copy of the simulation (`runOnBench`): current, voltage, strain, and the
   level and frequency of a pin or of the sound. Still to come as classes
   need them: how long a light stays on (class 3), harmonics (class 13).
5. **Where the app is kinder than a real board.** Partly done, and on
   purpose no further for now. A part driven harder than a real one would
   stand (an LED or diode with too much current, a resistor over a quarter of
   a watt, a supply over 1 A) carries on working and gets a "!" that says
   what would happen to a real one. An LED across the supply now passes
   1.33 A and is marked, instead of staying dark. Not done: a floating input
   still reads high and two outputs wired together still stall quietly. The
   classes that warn about those (7 and 9) should say so in words.
6. **A capacitor with no way to empty starts full** (see class 3). Not done:
   the classes keep avoiding it, as designed here.

Not needed for the course, but they would add classes later: light from an LED
reaching a photocell (Collins's light-chopped gates, and a way to control
loudness by voltage), a noise source, and an envelope.

## Sources

| Class | Collins, *Handmade Electronic Music* (1st edition) | Wilson, *Make: Analog Synthesizers* |
|---|---|---|
| 1 | Ch. 22 (lighting an LED), rules on LEDs | LED resistor values, Appendix A |
| 2 | Ch. 13 to 15 (pots, Ohm's law, photoresistors, electrodes) | Dividers as used throughout |
| 3 | | Capacitors, Ch. 2 |
| 4 | Ch. 18, the first oscillator and its explanation | Appendix C, CD40106 oscillator |
| 5 | Ch. 18 variations; Ch. 21 volume controls | |
| 6 | Ch. 18 (mixing, never join outputs, diode mixer) | Appendix C, pulse oscillator |
| 7 | Ch. 20, gated oscillators | "Never leave an input floating" |
| 8 | Ch. 21, the divider | |
| 9 | | Ch. 3, voltage control |
| 10 | | Ch. 3, sequencer |
| 11 | Ch. 21 (a chip cannot drive a speaker) | Appendix A, transistor LED switch |
| 12 | Ch. 23 (gain as a ratio), Ch. 28 (LM386) | Ch. 5, Appendix A (inverting amp, mixer, comparator, oscillator) |
| 13 | Ch. 23 (rounding a square wave) | Ch. 3 (filters, harmonics), Ch. 6 (the Noise Toaster's filter) |
| 14 | The rules of hacking | Troubleshooting; the WSG is Wilson's own design |

The copy of Collins in `docs.local` is the first edition, which has no 555, no
CD4017, no transistors and no op-amps. Classes 9 to 12 come from the app's own
examples and from Wilson.

Left out because the app cannot do them: everything in Collins that needs a
radio, a coil, a piezo, a microphone, a toy to open or an outside signal; and
in Wilson everything that needs a JFET, a PNP transistor or an LM13700, which
is most of the Noise Toaster's oscillator, envelope and loudness control.

## When the classes are built

- Each class's circuits are built by code, like the examples, and tested the
  same way: the test runs the circuit and checks the numbers the class quotes.
  A class must never quote a number its test does not check.
- The circuit a class keeps follows the examples' rule: a named switch whose
  effect is tested.
- Class text follows the rest of the app: short sentences, no term before it
  has been introduced.
- How a class is written and what the panel does with it is in `CLAUDE.md`
  under "Classes". Class 1 added things the design above did not have: every
  experiment asks for a guess before it shows what happened, and the build
  steps tick themselves off from the learner's own canvas.
