import { ModelRegistry } from './ModelRegistry';
import { ResistorModel } from './ResistorModel';
import { CapacitorModel } from './CapacitorModel';
import { PotentiometerModel } from './PotentiometerModel';
import { PowerSourceModel } from './PowerSourceModel';
import { GroundModel } from './GroundModel';
import { AudioOutputModel } from './AudioOutputModel';
import { DiodeModel, DIODE_1N4004_PARAMS, DIODE_1N914_PARAMS, DIODE_LED_RED_PARAMS } from './DiodeModel';
import { BJTModel, BJT_2N3904_PARAMS, BJT_2N3906_PARAMS } from './BJTModel';
import { OpAmpModel, OPAMP_LM324_PARAMS, OPAMP_LM741_PARAMS, OPAMP_TL072_PARAMS } from './OpAmpModel';
import { MultiOpAmpModel } from './MultiOpAmpModel';
import { JFETModel, JFET_2N5457_PARAMS } from './JFETModel';
import { CmosInverterModel } from './CmosInverterModel';
import { OtaModel } from './OtaModel';
import { SignalSourceModel } from './SignalSourceModel';
import { PiezoModel } from './PiezoModel';
import { OptoCouplerModel } from './OptoCouplerModel';
import { SchmittTriggerModel } from './SchmittTriggerModel';
import { ChangeoverSwitchModel, SwitchModel } from './SwitchModel';
import { JunctionModel } from './JunctionModel';
import { NandSchmittModel, BinaryCounterModel, DecadeCounterModel, DFlipFlopModel } from './CmosChipModel';
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
  // The parts the two books' circuits are made of (Collins, Handmade Electronic Music; Wilson, Make: Analog Synthesizers)
  models.register('audio-input', () => new SignalSourceModel());
  models.register('cd4049', () => new CmosInverterModel());
  models.register('cd4013', () => new DFlipFlopModel());
  models.register('lm324', () => new MultiOpAmpModel('lm324', OPAMP_LM324_PARAMS, 4));
  models.register('tl072', () => new MultiOpAmpModel('tl072', OPAMP_TL072_PARAMS, 2));
  models.register('lm13700', () => new OtaModel());
  models.register('spdt', () => new ChangeoverSwitchModel());
  models.register('optocoupler', () => new OptoCouplerModel());
  models.register('piezo', () => new PiezoModel());
  models.register('1n4004', () => new DiodeModel(DIODE_1N4004_PARAMS));
  models.register('2n5457', () => new JFETModel(JFET_2N5457_PARAMS));
  models.register('2n3906', () => new BJTModel(BJT_2N3906_PARAMS));
  return models;
}
