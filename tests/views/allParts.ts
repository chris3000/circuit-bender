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
import { ne555Definition } from '@/components/definitions/NE555';
import { cd4093Definition } from '@/components/definitions/CD4093';
import { cd4040Definition } from '@/components/definitions/CD4040';
import { cd4017Definition } from '@/components/definitions/CD4017';
import { lm386Definition } from '@/components/definitions/LM386';
import { ldrDefinition } from '@/components/definitions/LightDependentResistor';
import { speakerDefinition } from '@/components/definitions/Speaker';
import { pushButtonDefinition } from '@/components/definitions/PushButton';
import { bodyContactDefinition } from '@/components/definitions/BodyContact';
import { audioInputDefinition } from '@/components/definitions/AudioInput';
import { cd4049Definition } from '@/components/definitions/CD4049';
import { cd4013Definition } from '@/components/definitions/CD4013';
import { lm324Definition } from '@/components/definitions/LM324';
import { tl072Definition } from '@/components/definitions/TL072';
import { lm13700Definition } from '@/components/definitions/LM13700';
import { switchSpdtDefinition } from '@/components/definitions/SwitchSPDT';
import { optoCouplerDefinition } from '@/components/definitions/OptoCoupler';
import { piezoDefinition } from '@/components/definitions/Piezo';
import { diode1N4004Definition } from '@/components/definitions/Diode1N4004';
import { jfet2N5457Definition } from '@/components/definitions/JFET2N5457';
import { transistor2N3906Definition } from '@/components/definitions/Transistor2N3906';

/** In the order main.tsx registers them. */
export const ALL_PARTS: ComponentDefinition[] = [
  resistorDefinition, capacitorDefinition, cd40106Definition, lm741Definition, potentiometerDefinition,
  powerSupplyDefinition, groundDefinition, transistor2N3904Definition, diode1N914Definition,
  audioOutputJackDefinition, ledDefinition, switchDefinition, junctionDefinition,
  ne555Definition, cd4093Definition, cd4040Definition, cd4017Definition, lm386Definition,
  ldrDefinition, speakerDefinition, pushButtonDefinition, bodyContactDefinition,
  audioInputDefinition, cd4049Definition, cd4013Definition, lm324Definition, tl072Definition, lm13700Definition,
  switchSpdtDefinition, optoCouplerDefinition, piezoDefinition, diode1N4004Definition, jfet2N5457Definition, transistor2N3906Definition,
];

