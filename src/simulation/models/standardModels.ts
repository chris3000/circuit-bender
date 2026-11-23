import { ModelRegistry } from './ModelRegistry';
import { ResistorModel } from './ResistorModel';
import { CapacitorModel } from './CapacitorModel';
import { PotentiometerModel } from './PotentiometerModel';
import { PowerSourceModel } from './PowerSourceModel';
import { GroundModel } from './GroundModel';
import { AudioOutputModel } from './AudioOutputModel';
import { DiodeModel, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from './DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS } from './BJTModel';
import { OpAmpModel, OPAMP_LM741_PARAMS } from './OpAmpModel';
import { SchmittTriggerModel } from './SchmittTriggerModel';
import { SwitchModel } from './SwitchModel';
import { JunctionModel } from './JunctionModel';
import { NandSchmittModel, BinaryCounterModel, DecadeCounterModel } from './CmosChipModel';
import { Timer555Model } from './Timer555Model';
import { PowerAmpModel } from './PowerAmpModel';
import { VariableResistorModel, ldrOhms, touchOhms } from './VariableResistorModel';
import { SpeakerModel } from './SpeakerModel';

/**
 * Every part the app can simulate, by the `type` of its definition. The
 * worklet and the tests both build their solver from this, so a part is
 * registered once.
 */
export function createStandardModels(): ModelRegistry {
  const models = new ModelRegistry();
  models.register('resistor', () => new ResistorModel());
  models.register('capacitor', () => new CapacitorModel());
  models.register('potentiometer', () => new PotentiometerModel());
  models.register('power', () => new PowerSourceModel());
  models.register('ground', () => new GroundModel());
  models.register('audio-output', () => new AudioOutputModel());
  models.register('1n914', () => new DiodeModel(DIODE_1N914_PARAMS));
  models.register('led', () => new DiodeModel(DIODE_LED_RED_PARAMS));
  models.register('2n3904', () => new BJTModel(BJT_2N3904_PARAMS));
  models.register('lm741', () => new OpAmpModel(OPAMP_LM741_PARAMS));
  models.register('cd40106', () => new SchmittTriggerModel());
  models.register('switch', () => new SwitchModel());
  models.register('junction', () => new JunctionModel());
  // A push button is a switch that springs back; the springing is the player's finger
  models.register('pushbutton', () => new SwitchModel());
  models.register('cd4093', () => new NandSchmittModel());
  models.register('cd4040', () => new BinaryCounterModel());
  models.register('cd4017', () => new DecadeCounterModel());
  models.register('ne555', () => new Timer555Model());
  models.register('lm386', () => new PowerAmpModel());
  models.register('ldr', () => new VariableResistorModel('ldr', 'light', ldrOhms, 0.5));
  models.register('body-contact', () => new VariableResistorModel('body-contact', 'touch', touchOhms, 0));
  models.register('speaker', () => new SpeakerModel());
  return models;
}
