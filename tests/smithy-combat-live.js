(async()=>{
  if(game.world.id!=='drakkenheim'||game.user.name!=='Chuck'||!game.user.isGM)throw Error('Wrong authorized world/account.');
  const {runChecks,assert}=await import('/modules/morelord-core/scripts/testing/in-game.js');
  const body=globalThis.smithySource.replace("import {ID, escapeHTML as e} from './core.mjs';","const {ID,escapeHTML:e}=await import('/modules/morelord-game-master/scripts/core.mjs');").replace(/^export /gm,'');
  const {smithy}=await new (Object.getPrototypeOf(async()=>{}).constructor)(body+'\nreturn {smithy};')();
  const ID='morelord-game-master',KEY='smithyAtTheScar',original=canvas.scene;
  const actors={};
  for(const [key,name] of Object.entries({husk:'Haze Husk',ratling:'Ratling',chimera:'Chimera',hulk:'Haze Hulk',gutbuster:'Haze Hulk (Gutbuster)',hunter:'Haze Hulk (Hunter)',juggernaut:'Haze Hulk (Juggernaut)'})) {
    const matches=game.actors.filter(a=>a.name===name && a.type==='npc');
    assert(matches.length,`Missing ${name}`);
    actors[key]=(matches.find(a=>/drakkenheim/i.test(a._stats.compendiumSource ?? '')) ?? matches[0]).uuid;
  }
  let scene,combat,results;
  const beforeMessages=new Set(game.messages.map(m=>m.id));
  try {
    const data=game.scenes.get('PNczK53V7aOnK84v').toObject();delete data._id;delete data._stats;
    Object.assign(data,{name:'The Scar — unlinked combat regression',active:false,navigation:false,tokens:[]});
    scene=await Scene.create(data);await scene.unsetFlag(ID,KEY);await scene.view();
    const defenderData=(await (await fromUuid(actors.husk)).getTokenDocument({actorLink:false,name:'Regression defender',x:4000,y:4000},{parent:scene})).toObject();
    const [defender]=await scene.createEmbeddedDocuments('Token',[defenderData]);
    combat=await Combat.create({scene:null,active:false,combatants:[{tokenId:defender.id,sceneId:scene.id,actorId:defender.actorId,initiative:17}]});
    await scene.setFlag(ID,KEY,{actors,inset:1,wave:3,reinforcements:10});
    const beforeCombats=game.combats.size;
    results=await runChecks([
      {id:'smithy.unlinked-combat-and-four-hulk-types',async run(){
        assert(!game.combats.some(c=>c.scene?.id===scene.id),'Old scene-only lookup should miss this encounter.');
        const operation=smithy('next');let button;
        for(let i=0;i<200;i++){button=document.querySelector(`#${ID}-smithy-spawn [data-action="deploy"]`);if(button)break;await new Promise(r=>setTimeout(r,50));}
        assert(button,'Deployment prompt missing.');button.click();await operation;
        assert(game.combats.size===beforeCombats,'A second encounter was created.');
        assert(scene.getFlag(ID,KEY).combatId===combat.id,'Wrong encounter bound.');
        assert(combat.combatants.size===5,'Four hulks did not join the defender.');
        const deployed=scene.tokens.filter(t=>t.getFlag(ID,KEY)?.wave===4);
        assert(deployed.length===4 && new Set(deployed.map(t=>t.getFlag(ID,KEY).kind)).size===4,'Wave 4 is not one of each Hulk type.');
        assert(combat.combatants.every(c=>c.sceneId===scene.id && c.token && Number.isFinite(c.initiative)),'Combatant token links or initiative missing.');
        assert(combat.combatants.find(c=>c.tokenId===defender.id).initiative===17,'Defender initiative changed.');
      }},
      {id:'smithy.safe-word-in-unlinked-combat',async run(){
        const actor=await fromUuid(actors.ratling);
        const data=(await actor.getTokenDocument({actorLink:false,x:3500,y:3500,flags:{[ID]:{[KEY]:{wave:2,kind:'ratling'}}}},{parent:scene})).toObject();
        const [token]=await scene.createEmbeddedDocuments('Token',[data]);
        await combat.createEmbeddedDocuments('Combatant',[{tokenId:token.id,sceneId:scene.id,actorId:token.actorId,initiative:12}]);
        await smithy('safe');
        assert(token.disposition===0 && !combat.combatants.some(c=>c.tokenId===token.id),'Ratling stayed in global initiative.');
        assert(combat.combatants.size===5,'Safe word removed unrelated combatants.');
      }}
    ]);
  } finally {
    for(const app of [...foundry.applications.instances.values()])if(app.id?.startsWith(`${ID}-smithy-`))await app.close();
    const messages=game.messages.filter(m=>!beforeMessages.has(m.id)&&m.speaker.scene===scene?.id).map(m=>m.id);
    if(messages.length)await ChatMessage.deleteDocuments(messages);
    if(combat)await combat.delete();if(original)await original.view();if(scene)await scene.delete();
  }
  return {ok:results.every(r=>r.status==='pass'),world:game.world.id,foundry:game.version,results,actors,hulkSources:game.actors.filter(a=>a.name==='Haze Hulk').map(a=>({uuid:a.uuid,source:a._stats.compendiumSource,folder:a.folder?.name}))};
})()
