import type { Component, Connection } from '@/types/circuit';

/** An example as it is built: the circuit, and the part it is an example of. */
export interface ExampleBuild {
  components: Component[];
  connections: Connection[];
  /** The part being shown. It is the one selected when the example opens. */
  featured: Component;
}

/**
 * A small circuit that shows what one part does. Every part on the shelf has
 * one (`tests/examples/parts/common.test.ts` holds them to that), and parts of
 * a kind may share a circuit: each still has its own entry here, with its own
 * words.
 */
export interface PartExample {
  /** Names it for good: "resistor-dimmer". */
  id: string;
  /** The part it is an example of: a definition's `type`. */
  part: string;
  /**
   * For a part that comes in values: the largest value this example is for.
   * A part's examples are listed smallest first, and the last has no `to`.
   * `only` is one value with a use of its own (10 kΩ: the pull-down).
   */
  to?: number;
  only?: number;
  /** The circuit's name on the canvas: "Dimmer". */
  name: string;
  /**
   * What the part is doing in the circuit, then what to do and what happens.
   * Short sentences, no dashes, and no figure the example's test does not measure.
   */
  description: string | ((value: number) => string);
  /** `value` is the value of the part asked about; the featured part has it. */
  build: (value?: number) => ExampleBuild;
}
