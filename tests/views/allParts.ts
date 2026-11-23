import type { ComponentDefinition } from '@/types/circuit';
import { resistorDefinition } from '@/components/definitions/Resistor';
import { capacitorDefinition } from '@/components/definitions/Capacitor';
import { cd40106Definition } from '@/components/definitions/CD40106';
import { lm741Definition } from '@/components/definitions/LM741';
import { potentiometerDefinition } from '@/components/definitions/Potentiometer';
import { powerSupplyDefinition } from '@/components/definitions/PowerSupply';
import { groundDefinition } from '@/components/definitions/Ground';
import { transistor2N3904Definition } from '@/components/definitions/Transistor2N3904';
import { diode1N914Definition } from '@/components/definitions/Diode1N914';
import { audioOutputJackDefinition } from '@/components/definitions/AudioOutputJack';
import { ledDefinition } from '@/components/definitions/LED';
import { switchDefinition } from '@/components/definitions/Switch';
import { junctionDefinition } from '@/components/definitions/Junction';

/** In the order main.tsx registers them. */
export const ALL_PARTS: ComponentDefinition[] = [
  resistorDefinition, capacitorDefinition, cd40106Definition, lm741Definition, potentiometerDefinition,
  powerSupplyDefinition, groundDefinition, transistor2N3904Definition, diode1N914Definition,
  audioOutputJackDefinition, ledDefinition, switchDefinition, junctionDefinition,
];

