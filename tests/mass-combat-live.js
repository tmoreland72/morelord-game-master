// Explicitly authorized Drakkenheim / The Scar testing, always in a disposable copy.
(async()=>{
  if(game.world.id!=='drakkenheim'||game.user.name!=='Chuck'||!game.user.isGM)throw Error('Wrong world/account.');
  const sourceScene=game.scenes.get('PNczK53V7aOnK84v');
  if(sourceScene?.name!=='The Scar')throw Error('Authorized scene missing.');
  const {runChecks,assert}=await import('/modules/morelord-core/scripts/testing/in-game.js');
  const source=globalThis.massCombatSource;
  const body=source.replace("import {ID, escapeHTML as e} from './core.mjs';","const {ID,escapeHTML:e}=await import('/modules/morelord-game-master/scripts/core.mjs');").replace(/^export /gm,'');
  const {massCombat,installMassCombat}=await new (Object.getPrototypeOf(async()=>{}).constructor)(body+'\nreturn {massCombat,installMassCombat};')();
  const ID='morelord-game-master',KEY='massCombat',oldScene=canvas.scene;
  const oldState=foundry.utils.deepClone(game.user.getFlag(ID,KEY));
  if(oldState?.pendingId)throw Error('A real mass-combat result is pending.');
  const sourceIds=sourceScene.tokens.map(t=>t.id);
  let scene,combat,targetActor,results,previewHTML;
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  const select=tokens=>{canvas.tokens.releaseAll();for(const token of tokens)token.object.control({releaseOthers:false});};
  let attackers,targets;
  try {
    const data=sourceScene.toObject();delete data._id;delete data._stats;
    Object.assign(data,{name:'The Scar — temporary mass combat test',active:false,navigation:false,tokens:[]});
    scene=await Scene.create(data);await scene.view();
    const husk=game.actors.get('69bAXRvZS0qdPrlI');
    assert(husk,'Haze Husk source missing.');
    targetActor=await Actor.create({name:'Mass combat disposable target',type:'npc',prototypeToken:{actorLink:false},system:{attributes:{hp:{value:5,max:5},ac:{calc:'flat',flat:12}}}});
    const tokenData=[];
    for(let i=0;i<20;i++)tokenData.push((await husk.getTokenDocument({actorLink:false,name:`Test attacker ${i+1}`,x:2000+(i%10)*100,y:2000+Math.floor(i/10)*100},{parent:scene})).toObject());
    for(let i=0;i<3;i++)tokenData.push((await targetActor.getTokenDocument({actorLink:false,name:`Test target ${i+1}`,x:2000+i*100,y:2400},{parent:scene})).toObject());
    const created=await scene.createEmbeddedDocuments('Token',tokenData);
    // Foundry may return embedded documents in collection order, not request order.
    attackers=created.filter(t=>t.name.startsWith('Test attacker '));
    targets=created.filter(t=>t.name.startsWith('Test target ')).sort((a,b)=>a.name.localeCompare(b.name));
    for(const token of targets)await token.actor.update({'system.attributes.hp.value':5,'system.attributes.hp.max':5,'system.attributes.hp.temp':0,'system.attributes.hp.formula':''});
    await targets[0].actor.update({'system.attributes.hp.temp':2,'system.traits.dr.value':['slashing']});
    await targets[1].actor.update({'system.traits.di.value':['slashing']});
    combat=await Combat.create({scene:null,active:false,combatants:targets.map(t=>({tokenId:t.id,sceneId:scene.id,actorId:t.actorId}))});
    await game.user.unsetFlag(ID,KEY);
    results=await runChecks([
      {id:'mass.capture-twenty-attackers',async run(){
        select(attackers);await massCombat('attackers');
        assert(game.user.getFlag(ID,KEY).attackerIds.length===20,'Attacker group was not remembered.');
      }},
      {id:'mass.preview-focus-resistance-and-immunity',async run(){
        const hpBefore=targets.map(t=>({value:t.actor.system.attributes.hp.value,temp:t.actor.system.attributes.hp.temp}));
        select(targets);const promise=massCombat('resolve');
        let root;
        for(let i=0;i<200;i++){root=document.getElementById(`${ID}-mass-attack`);if(root)break;await delay(50);}
        assert(root,'Attack form did not render.');
        for(const [name,value] of Object.entries({bonus:100,attacks:1,damage:7,critical:11,type:'slashing',mode:'normal'}))root.querySelector(`[name="${name}"]`).value=value;
        root.querySelector('[name="magical"]').checked=false;
        root.querySelector('[data-action="roll"]').click();await promise;
        const message=game.messages.get(game.user.getFlag(ID,KEY).pendingId),batch=message?.getFlag(ID,KEY);
        assert(batch?.stage==='preview','No batch preview.');
        assert(batch.result.rows[0].normal===3 && batch.result.rows[1].normal===0,'Native per-hit resistance/immunity incorrect.');
        assert(batch.result.rows[0].hp===0 && batch.result.rows[1].hp===5 && batch.result.rows[2].attempts===0,'Focus did not stop on the immune target.');
        assert(targets.every((t,i)=>t.actor.system.attributes.hp.value===hpBefore[i].value && t.actor.system.attributes.hp.temp===hpBefore[i].temp),`Preview HP mismatch: ${JSON.stringify({before:hpBefore,after:targets.map(t=>({value:t.actor.system.attributes.hp.value,temp:t.actor.system.attributes.hp.temp}))})}`);
        assert(message.whisper.length && message.whisper.every(id=>game.users.get(id)?.isGM),'Preview leaked beyond GMs.');
        previewHTML=message.content;
      }},
      {id:'mass.stale-preview-rejected',async run(){
        await targets[2].actor.update({'system.attributes.hp.value':4});
        await massCombat('apply');
        assert(targets[0].actor.system.attributes.hp.value===5,'Stale preview partially applied.');
        await targets[2].actor.update({'system.attributes.hp.value':5});
      }},
      {id:'mass.apply-hp-without-status-or-defeated-writes',async run(){
        const message=game.messages.get(game.user.getFlag(ID,KEY).pendingId);
        const actor=targets[0].actor, originalToggle=actor.toggleStatusEffect;
        let statusCalls=0;
        actor.toggleStatusEffect=function(...args){statusCalls++;return originalToggle.apply(this,args);};
        try {await massCombat('apply');} finally {actor.toggleStatusEffect=originalToggle;}
        assert(statusCalls===0,'Macro explicitly toggled a status.');
        assert(message.getFlag(ID,KEY).stage==='applied','Batch failed to apply.');
        assert(targets[0].actor.system.attributes.hp.value===0 && targets[0].actor.system.attributes.hp.temp===0,'HP/temp HP did not match the preview.');
        assert(!combat.combatants.find(c=>c.tokenId===targets[0].id).defeated,'Macro marked combatant defeated.');
        assert(targets[1].actor.system.attributes.hp.value===5 && targets[2].actor.system.attributes.hp.value===5,'Survivors changed.');
        assert(scene.tokens.size===23,'Tokens were deleted.');
        await massCombat('apply');
        assert(targets[1].actor.system.attributes.hp.value===5,'Repeated apply caused extra damage.');
      }}
    ]);
  } finally {
    for(const app of [...foundry.applications.instances.values()])if(app.id?.startsWith(`${ID}-mass-`))await app.close();
    if(combat)await combat.delete();
    const messages=game.messages.filter(m=>m.getFlag(ID,KEY)?.sceneId===scene?.id).map(m=>m.id);
    if(messages.length)await ChatMessage.deleteDocuments(messages);
    if(oldScene)await oldScene.view();
    if(scene)await scene.delete();
    if(targetActor)await targetActor.delete();
    if(oldState===undefined)await game.user.unsetFlag(ID,KEY);else await game.user.setFlag(ID,KEY,oldState);
  }
  const ok=results.every(r=>r.status==='pass');
  let installed=[];
  if(ok)installed=await installMassCombat(source);
  assert(sourceScene.tokens.size===sourceIds.length && sourceIds.every(id=>sourceScene.tokens.has(id)),'Original scene tokens changed.');
  // A client-only display of the actual generated card allows visual QA without leaving test chat.
  for(const app of [...foundry.applications.instances.values()])await app.close();
  if(previewHTML)void foundry.applications.api.DialogV2.wait({id:'mass-combat-test-preview',classes:['ml-window'],window:{title:'Mass Combat — Test preview'},position:{width:540},content:`<div><div class="ml-app ml-app-shell ml-dialog-shell">${previewHTML}</div></div>`,buttons:[{action:'close',label:'Close'}]});
  await delay(600);
  return {ok,world:game.world.id,scene:sourceScene.name,disposableCopy:true,foundry:game.version,system:game.system.version,results,installed:installed.map(m=>({id:m.id,name:m.name})),originalTokens:sourceIds.length};
})()
