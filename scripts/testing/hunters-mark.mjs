import {assert} from '../../../morelord-core/scripts/testing/in-game.js';
import {huntersMarkHit} from '../triggers.mjs';
export const huntersMarkOriginCheck={id:'game-master.hunters-mark-native-origin',async run(){
  assert(game.world.id==='dev1','Dev1 required.');
  // Read existing native documents; never reroll or alter the reported attack.
  const actor=game.actors.find(a=>a.items.some(i=>i.system.identifier==='hunters-mark') && a.concentration.items.size);
  assert(actor,'A character concentrating on Hunter\'s Mark is required.');
  const attack=game.messages.filter(m=>m.type==='attack' && m.speaker.actor===actor.id).reverse().find(m=>m.system.targets?.some(t=>fromUuidSync(t.token)?.actor?.appliedEffects.some(e=>e.active && e.system?.origin?.activity)));
  assert(attack,'A native attack against a marked target is required.');
  const hit=huntersMarkHit(attack,actor,actor.items.get(attack.system.item.id));
  assert(hit?.feature.system.identifier==='hunters-mark','Native casting provenance must resolve the attacker\'s mark.');
  const activity=hit.feature.system.activities.find(a=>a.type==='damage');
  for(const critical of [false,true]){
    const config=activity.getDamageConfig({isCritical:critical});config.subject=activity;config.hookNames=['damage'];
    const rolls=await CONFIG.Dice.DamageRoll.build(config,{configure:false},{create:false});
    assert(rolls?.length && rolls[0].options.type==='force','Native mark damage retains Force type.');
    assert(rolls[0].dice.reduce((n,d)=>n+d.number,0)===(critical?2:1),'Normal mark rolls 1d6; critical mark rolls 2d6.');
  }
}};
