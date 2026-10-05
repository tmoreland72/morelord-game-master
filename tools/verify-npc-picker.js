(async()=>{
  if(game.world.id!=='drakkenheim'||game.user.name!=='Chuck'||!game.user.isGM)throw Error('Wrong world/account.');
  await game.scenes.get('PNczK53V7aOnK84v').view();
  await new Promise(r=>setTimeout(r,1000));
  const id='morelord-game-master',data=globalThis.npcPickerDefinition;
  const existing=game.macros.find(m=>m.getFlag(id,'selectTroops')==='npc-picker');
  if(existing)await existing.update(data);
  const macro=existing??await Macro.create(data);
  const selected=canvas.tokens.controlled.map(t=>t.id),results=[];
  const dialog=async()=>{
    for(let i=0;i<100;i++){const root=document.getElementById('morelord-game-master-select-npcs');if(root)return root;await new Promise(r=>setTimeout(r,50));}
    throw Error('Picker did not open.');
  };
  try {
    let promise=macro.execute(),root=await dialog();
    const options=[...root.querySelectorAll('option')].map(o=>({value:o.value,label:o.textContent}));
    const beforeCancel=canvas.tokens.controlled.map(t=>t.id);
    root.querySelector('[data-action="cancel"]').click();await promise;await new Promise(r=>setTimeout(r,400));
    if(canvas.tokens.controlled.length!==beforeCancel.length)throw Error('Cancel changed selection: '+JSON.stringify({beforeCancel,after:canvas.tokens.controlled.map(t=>t.id)}));
    for(const option of options){
      promise=macro.execute();root=await dialog();
      root.querySelector('select').value=option.value;root.querySelector('[data-action="select"]').click();await promise;await new Promise(r=>setTimeout(r,400));
      const expected=Number(option.label.match(/\((\d+)\)$/)[1]);
      if(canvas.tokens.controlled.length!==expected||canvas.tokens.controlled.some(t=>t.actor.type!=='npc'))throw Error('Wrong selection: '+option.label);
      results.push({type:option.label,selected:expected});
    }
    const old=game.macros.filter(m=>['thugs','veterans','haze-husks','ratlings'].includes(m.getFlag(id,'selectTroops')));
    await game.settings.set(id,'macros',[...new Set([...(game.settings.get(id,'macros')??[]).filter(uuid=>!old.some(m=>m.uuid===uuid)),macro.uuid])]);
    if(old.length)await Macro.deleteDocuments(old.map(m=>m.id));
  } finally {canvas.tokens.releaseAll();for(const tokenId of selected)canvas.tokens.get(tokenId)?.control({releaseOthers:false});}
  void macro.execute();await dialog();
  return {ok:true,results};
})()
