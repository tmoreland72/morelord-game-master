import {ID} from '../core.mjs';
import {activeGM} from '../requests.mjs';

export const worldClockChecks = [{
  id:'game-master.world-clock',
  async run() {
    if (game.world.id.toLowerCase() !== 'dev1') throw new Error('World clock checks require Dev1.');
    if (activeGM()?.id !== game.user.id) throw new Error('Run this check on the active GM.');
    if (game.combats.some(c=>c.started)) throw new Error('Finish existing test combats before running this check.');
    const {assert} = await import('../../../morelord-core/scripts/testing/in-game.js');
    const board=foundry.utils.deepClone(game.settings.get(ID,'board')), time=game.time.worldTime, paused=game.paused;
    let combat;
    try {
      game.togglePause(true,true);
      await game.settings.set(ID,'board',{...board,triggers:[{id:'clock-test',kind:'world-clock',enabled:true,gameMinutes:10,realMinutes:1}]});
      combat=await Combat.create({name:'Morelord clock test',active:false});
      await combat.startCombat();await combat.nextRound();await combat.nextRound();
      assert(game.time.worldTime===time,'Combat must defer native world-time advancement.');
      assert(combat.getFlag(ID,'clockSeconds')===12,'Three rounds must retain twelve seconds plus the final round.');
      await game.time.advance(-60);
      assert(game.time.worldTime===time-60,'Manual calendar adjustments must remain available during combat.');
      await combat.delete();combat=null;
      for(let i=0;i<30 && game.time.worldTime!==time-42;i++) await new Promise(resolve=>setTimeout(resolve,100));
      assert(game.time.worldTime===time-42,'Ending three rounds must add exactly eighteen seconds.');
    } finally {
      // Disable the fixture before cleanup; do not write the global trigger file.
      await game.settings.set(ID,'board',{...board,triggers:[]});
      if(combat) {await combat.unsetFlag(ID,'clockSeconds');await combat.delete();}
      await game.settings.set(ID,'board',board);
      await game.time.advance(time-game.time.worldTime);
      game.togglePause(paused,true);
    }
  }
}];
