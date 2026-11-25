import {assert} from '../../../morelord-core/scripts/testing/in-game.js';

export const gameMasterSettingsCheck={id:'game-master.settings-save-before-close',async run(){
  assert(game.world.id==='dev1' && game.user.isGM,'Run as GM in Dev1');
  const id='morelord-game-master-game-master-settings';
  assert(!foundry.applications.instances.get(id)?.rendered,'Close Game Master settings before testing');
  const original=game.settings.set;
  let dialog;
  try{
    // Do not persist migration or settings changes from this regression.
    game.settings.set=async()=>{};
    const App=game.settings.menus.get('morelord-game-master.configure').type;
    new App().render();
    await until(()=>{dialog=foundry.applications.instances.get(id);return dialog?.rendered;});
    const button=dialog.element.querySelector('[data-action="ok"]');
    assert(button.textContent.trim()==='Save Changes','Game Master uses Save Changes');
    game.settings.set=async()=>{throw Error('Regression save failure');};
    await dialog._onSubmit(button,{preventDefault(){}});
    assert(dialog.rendered && !button.disabled,'Failed save keeps the Game Master settings dialog open');
    let writes=0,finish;
    game.settings.set=async()=>{if(++writes===1)await new Promise(resolve=>finish=resolve);};
    const pending=dialog._onSubmit(button,{preventDefault(){}});
    await until(()=>finish);
    assert(dialog.rendered && button.disabled,'Game Master settings stay open while saving');
    finish();await pending;
    assert(!dialog.rendered && writes===2,'Dialog closes only after both settings writes succeed');
  }finally{game.settings.set=original;if(dialog?.rendered)await dialog.close();}
}};

async function until(read){const end=Date.now()+15000;while(Date.now()<end){if(read())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Settings regression timed out');}
