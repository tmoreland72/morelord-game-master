import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {migrateTriggerMacros} from '../trigger-catalog.mjs';
import {initializeTriggerMacros} from '../trigger-macros.mjs';
export const defaultTriggersCheck={id:'game-master.fresh-global-triggers-stopped',async run(){
  assert(game.world.id==='dev1'&&game.user.isGM,'Dev1 GM required.');
  const ID='morelord-game-master',board=foundry.utils.deepClone(game.settings.get(ID,'board'));
  try {
    for(const seed of [[],[{id:'volatile-magic',kind:'volatile',enabled:false}]]){
      const placeholder={id:'item',kind:'item',actorName:'Configured character',enabled:false};
      assert(migrateTriggerMacros([placeholder],{includeDefaults:false}).length===0,'Remove the old unconfigured panel template');
      const triggers=migrateTriggerMacros(seed);
      assert(triggers.length===5&&triggers.every(t=>t.enabled===false),'Fresh and Volatile-only installations need five stopped triggers.');
      for(const trigger of triggers)assert((await fromUuid(trigger.macroUuid))?.documentName==='Macro','Every default resolves to an installed Macro.');
      await game.settings.set(ID,'board',{...board,triggers});
      const runtime=await initializeTriggerMacros();await runtime.sync();
      assert(triggers.every(t=>runtime.status(t.id)==='Stopped'),'No default macro starts listeners.');
    }
  } finally {await game.settings.set(ID,'board',board);await initializeTriggerMacros();}
}};
