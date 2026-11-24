import { createContext, useContext } from 'react';
import type { InstrumentReport } from '@/simulation/worklet/Instruments';

export type MeterReport = NonNullable<InstrumentReport['meter']>;
export type MeterSource = (listener: (report: MeterReport) => void) => () => void;

export interface InstrumentsValue {
  /** Whether the circuit is running: there is nothing to read otherwise. */
  playing: boolean;
  /** The parts being driven harder than real ones would stand, by id. */
  overloaded: ReadonlySet<string>;
  /** Hear each reading of the meter, about eight a second while the circuit runs. */
  meter: MeterSource;
}

const NOTHING: InstrumentsValue = { playing: false, overloaded: new Set(), meter: () => () => {} };

/**
 * What the running simulation can be seen to be doing, for whoever draws it:
 * the "!" on an overloaded part, the readings in the inspector and beside
 * the scope's probes. (How bright the LEDs are comes down as a prop, since
 * every view needs it.)
 */
export const InstrumentsContext = createContext<InstrumentsValue>(NOTHING);
export const useInstruments = () => useContext(InstrumentsContext);

/** What to say about an overloaded part that says nothing itself. */
export const OVERLOADED = 'This part is being driven harder than a real one would stand.';
