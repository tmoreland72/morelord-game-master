import {assert,runChecks} from '../../../morelord-core/scripts/testing/in-game.js';
import {smithy} from '../smithy-at-the-scar.mjs';
export const smithyCheck={id:'game-master.smithy-native-waves-and-safe-word',async run(){
  assert(game.world.id==='dev1'&&game.user.isGM,'Dev1 GM required.');
  const ID='morelord-game-master',KEY='smithyAtTheScar';
  const scene=await Scene.create({name:'MLGM Smithy regression',width:8000,height:8000,grid:{type:1,size:100},active:false,navigation:false,tokens:[]});
  const fixtureActors=[];
  const originals=new Map(scene.tokens.map(t=>[t.id,JSON.stringify(t.toObject())]));
  const messages=new Set(game.messages.map(m=>m.id));
  const previousScene=canvas.scene, previousCombat=game.combat;
  const actors={};
  for(const [kind,name] of Object.entries({husk:'Haze Husk',ratling:'Ratling',chimera:'Chimera',hulk:'Haze Hulk',gutbuster:'Haze Hulk (Gutbuster)',hunter:'Haze Hulk (Hunter)',juggernaut:'Haze Hulk (Juggernaut)'})) {
    const actor=await Actor.create({name:'MLGM '+name,type:'npc',system:{attributes:{hp:{value:10,max:10},ac:{calc:'flat',flat:12}}}});fixtureActors.push(actor);actors[kind]=actor.uuid;
  }
  let combat,results;
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const invoke=async(action,button='deploy')=>{
    let done=false;
    const promise=smithy(action).finally(()=>{done=true;});
    for(let i=0;i<300 && !done;i++) {
      const root=document.querySelector(`#${ID}-smithy-${action==='setup'?'setup':'spawn'}`);
      const control=root?.querySelector(`[data-action="${button}"]`);
      if(control) {control.click();break;}
      await delay(50);
    }
    return promise;
  };
  const spawned=()=>scene.tokens.filter(t=>!originals.has(t.id));
  try {
    await scene.view();
    combat=await Combat.create({scene:scene.id,active:false});
    await scene.setFlag(ID,KEY,{actors,inset:1,combatId:combat.id});
    results=await runChecks([
      {id:'smithy.setup-ui',async run(){
        await invoke('setup','save');
        assert(scene.getFlag(ID,KEY).actors.husk===actors.husk,'Setup did not save the selected actors.');
      }},
      {id:'smithy.wave-one-placement-and-initiative',async run(){
        await invoke('next');
        assert(spawned().length===12,'Wave 1 did not create 12 tokens.');
        assert(combat.combatants.size===12,'Wave 1 combatants missing.');
        assert(spawned().every(t=>!t.actorLink && t.disposition===-1),'Tokens must have independent HP and be hostile.');
        assert(combat.combatants.every(c=>Number.isFinite(c.initiative)),'Native initiative did not roll.');
        const hp=spawned().map(t=>t.actor.system.attributes.hp.value);
        const first=spawned()[0];
        await first.actor.update({'system.attributes.hp.value':Math.max(0,hp[0]-1)});
        assert(spawned().slice(1).every((t,i)=>t.actor.system.attributes.hp.value===hp[i+1]),'HP was shared across tokens.');
      }},
      {id:'smithy.reinforcement-and-duplicate-guard',async run(){
        // A disposable combat only; suppress turn events so campaign time is not advanced.
        await combat.update({round:1},{turnEvents:false});
        await invoke('reinforce');
        const state=scene.getFlag(ID,KEY),count=state.lastReinforcementCount;
        assert(count>=1 && count<=6 && spawned().length===12+count,'Reinforcement die/count mismatch.');
        const beforeCount=spawned().length;
        await smithy('reinforce');
        assert(spawned().length===beforeCount && scene.getFlag(ID,KEY).reinforcements===1,'Duplicate reinforcement spawned.');
        await scene.setFlag(ID,KEY,{...scene.getFlag(ID,KEY),reinforcements:10});
      }},
      {id:'smithy.wave-two-and-safe-word',async run(){
        await invoke('next');
        const rats=spawned().filter(t=>t.getFlag(ID,KEY)?.kind==='ratling');
        assert(rats.length===20,'Wave 2 did not create 20 ratlings.');
        await smithy('safe');
        assert(rats.every(t=>t.disposition===0 && !combat.combatants.some(c=>c.tokenId===t.id)),'Safe word did not stand down ratlings.');
        await smithy('safe');
        assert(scene.getFlag(ID,KEY).ratlingsStopped,'Safe word is not repeatable.');
      }},
      {id:'smithy.wave-three-and-four',async run(){
        await invoke('next');
        const third=spawned().filter(t=>t.getFlag(ID,KEY)?.wave===3);
        assert(third.length===11 && third.filter(t=>t.getFlag(ID,KEY).kind==='chimera').length===1,'Wave 3 roster mismatch.');
        await invoke('next');
        assert(spawned().filter(t=>t.getFlag(ID,KEY)?.wave===4).length===4,'Wave 4 roster mismatch.');
        const total=spawned().length;
        await smithy('next');
        assert(spawned().length===total,'A fifth wave was spawned.');
      }}
    ]);
  } finally {
    for(const app of foundry.applications.instances.values()) if(app.id?.startsWith(`${ID}-smithy-`)) await app.close();
    // Delete only the fixture combat, fixture tokens, and their initiative messages.
    const tokenIds=spawned().filter(t=>t.getFlag(ID,KEY)).map(t=>t.id);
    const tokenSet=new Set(tokenIds);
    const messageIds=game.messages.filter(m=>!messages.has(m.id) && m.speaker.scene===scene.id && tokenSet.has(m.speaker.token)).map(m=>m.id);
    if(combat) {
      // Reset disposable round state before deletion; do not trigger combat-end clock settlement.
      await combat.update({round:0,turn:null},{turnEvents:false});
      await combat.delete();
    }
    if(tokenIds.length) await scene.deleteEmbeddedDocuments('Token',tokenIds);
    if(messageIds.length) await ChatMessage.deleteDocuments(messageIds);
    if(previousCombat && !previousCombat.active) await previousCombat.update({active:true});
    const changes=[];
    for(const [id,data] of originals) {
      const old=JSON.parse(data),now=scene.tokens.get(id)?.toObject();
      const fields=Object.keys(old).filter(k=>JSON.stringify(old[k])!==JSON.stringify(now?.[k]));
      if(fields.length) changes.push({id,fields:fields.map(k=>({key:k,before:old[k],after:now?.[k]}))});
    }
    globalThis.smithyTestDiagnostics={results,changes,remainingTokens:scene.tokens.size};
    if(previousScene && previousScene.id!==scene.id) await previousScene.view();
    await scene.delete();
    for(const actor of fixtureActors)await actor.delete();
    assert(!changes.length,`Copied token changes detected: ${JSON.stringify(changes)}`);
  }
  assert(results.every(r=>r.status==='pass'),results.filter(r=>r.status!=='pass').map(r=>r.id+': '+r.reason).join('; '));
}};
