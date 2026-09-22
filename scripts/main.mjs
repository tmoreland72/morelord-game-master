import {initializeTriggerMacros,triggerStatus,triggerMacroUuid} from './trigger-macros.mjs';
import {rollOfFate} from './roll-of-fate.mjs';
import {initializeGlobalTriggers,saveGlobalTriggers} from "./global-triggers.mjs";
import {clockInterval,initializeDeferredClockSettlement} from "./world-clock.mjs";
import {initializeTriggers,luckyFindWorldTable} from "./triggers.mjs";
import { ID, escapeHTML as e, companionURL } from "./core.mjs";
import { core, craftworks, recipient, initializeRequests, createRequest, foragingTerrains } from "./requests.mjs";

const tabs = { rolls: "Roll Requests", macros: "Macros", sound: "Sound", triggers: "Triggers", ai: "Campaign AI", party: "Player Settings" };
let root, open = false, tab = "rolls", state, saving = Promise.resolve(), status = "Ready. Choose an action to configure it.";
let campaign, campaigns = [], connection, aiBusy = false;
const drafts = new Map();
let campaignSelection = 0;
let terrainOptions = [];
const get = key => game.settings.get(ID, key);
const button = (action, label, id = "", extra = "") => `<button type="button" data-action="${action}" data-id="${e(id)}" ${extra}>${e(label)}</button>`;
const deleteButton = (action, id, name) => `<button type="button" class="ml-icon-button" data-action="${action}" data-id="${e(id)}" title="Delete ${e(name)}" aria-label="Delete ${e(name)}"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`;
const savedButton = (action, name, id, remove) => `<div class="ml-item-row"><div class="ml-stack">${button(action,name,id)}</div>${deleteButton(remove,id,name)}</div>`;
const option = (id, name, selected) => `<option value="${e(id)}" ${id === selected ? "selected" : ""}>${e(name)}</option>`;
const column = (title, body, cls = "") => `<div class="ml-stack gm-column ${cls}" data-gap="4"><strong>${e(title)}</strong>${body}</div>`;
const label = (name, content) => `<label><span>${e(name)}</span>${content}</label>`;
const input = (name, value = "", attrs = "") => `<input name="${name}" value="${e(value)}" ${attrs}>`;
const select = (name, options) => `<select name="${name}">${options}</select>`;
const gm = () => { if (!game.user.isGM) throw new Error("Only the GM can use this action."); };
const notify = text => { status = text; };
function fail(error) { console.error(`${ID} |`, error); ui.notifications.error(error.message ?? String(error)); notify(error.message ?? String(error)); }
function persist(change) {
  // Serialize settings writes so fast clicks cannot overwrite a previous save.
  saving = saving.catch(() => {}).then(async () => {
    const next = foundry.utils.deepClone(state);
    change(next);
    if (JSON.stringify(next.triggers) !== JSON.stringify(state.triggers)) await saveGlobalTriggers(next.triggers);
    await game.settings.set(ID, "board", next);
    state = next;
  });
  return saving;
}
async function form(title, content, actions = [["ok", "Save"]]) {
  return foundry.applications.api.DialogV2.wait({ id:`${ID}-${title.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/-$/,"")}`, classes:["ml-window"], window: { title, resizable: true }, position: { width: /Ambience|campaign|Verify/i.test(title) ? 560 : /Trigger Character|Trigger Action|settings/i.test(title) ? 480 : 400 },
    content: `<div><div class="ml-app ml-app-shell ml-dialog-shell">${content}</div></div>`, rejectClose: false,
    buttons: actions.map(([action, text], i) => ({ action, label: text, default: i === 0,
      callback: (_event, btn) => ({ action, data: new FormData(btn.form) }) })) });
}

Hooks.once("init", () => {
  class GameMasterSettings extends foundry.applications.api.ApplicationV2 {
    render() { settings().catch(fail); return this; }
  }
  game.settings.registerMenu(ID,"configure",{name:"Morelord Game Master",label:"Configure",hint:"Ambience and Campaign AI settings.",icon:"fa-solid fa-dice-d20",type:GameMasterSettings,restricted:true});
  game.settings.register(ID, "board", { scope: "world", config: false, type: Object,
    default: { saved: [], scenarios: [], last: {}, triggers: [] } });
  game.settings.register(ID,"macros",{scope:"world",config:false,type:Array,default:[]});
  game.settings.register(ID, "ambienceFolder", { name: "Ambience folder", hint: "A folder in Foundry's user data containing audio files.", scope: "world", config: false, type: String, default: "Ambience" });
  game.settings.register(ID, "companion", { name: "Campaign AI companion URL", hint: "The local Morelord companion service. Provider keys stay on the service.", scope: "client", config: false, type: String, default: "http://127.0.0.1:31401" });
  game.keybindings.register(ID, "toggle", { name: "Toggle Game Master tray", restricted: true,
    editable: [{ key: "KeyG", modifiers: ["Alt"] }], onDown: () => { toggle(); return true; } });
});

Hooks.once("ready", async () => {
  initializeDeferredClockSettlement(() => (game.settings.get(ID,'board').triggers ?? []).some(t => t.kind === 'world-clock' && t.enabled && triggerStatus(t.id) === 'Running'));
  try { initializeRequests(); await initializeGlobalTriggers(); initializeTriggers(); await initializeTriggerMacros(); await core().compendiums?.organize([{collection:`${ID}.macros`,label:"Game Master Macros"},{collection:`${ID}.roll-tables`,label:"Game Master Roll Tables"}],["Morelord Gaming","Game Master"]); } catch(error) { ui.notifications.error(error.message); return; }
  game.modules.get(ID).api = { toggle, requestCheck, requestEncounter:encounter, requestDeathSave:() => requestCheck({kind:"death",...state?.last.death}), rollOfFate, addTrigger };
  core().ui.documentation.register({id:ID,title:"Morelord Game Master",subtitle:"Your table, within reach.",icon:"fa-solid fa-dice-d20",sections:[
    {id:"rolls",title:"Requests and character verification",icon:"fa-solid fa-dice",paragraphs:["Select participants on the Party tab. Configure roll options directly on cards; every change is remembered. Dice buttons request immediately. Core assigns each character to an eligible logged-in player or the active GM. If a player disconnects, any GM can resolve the pending chat request.","Roll requests are always public. Blind results and summaries are private to GMs and Assistant GMs; disable Blind roll for public results. Requests remain in chat, where any GM can roll for anyone. Blind death saves use native system bonuses, but the GM tracks successes and failures privately. Skill checks include individual totals and an average after all rolls are complete."]},
    {id:"tools",title:"Sound, macros, and triggers",icon:"fa-solid fa-sliders",paragraphs:["Save playlist and ambience buttons, and drag macros into the empty Macros tab. Configure the ambience folder in Game settings. Configured triggers continue while the tray is hidden. Configured World Clock triggers advance 10 game minutes per real minute by default, with configurable intervals. Pause and combat suspend the clock; combat adds 6 seconds per round when it ends. Calendar adjustments remain available."]},
    {id:"ai",title:"Campaign AI",icon:"fa-solid fa-book",paragraphs:["Start the local companion, enter its URL and token in Game settings, and connect from Campaign AI. The companion keeps campaign files and conversations separate. Sending shares the selected campaign context with your configured OpenAI model. See the module README for private service setup."]}
  ]});
  if (!game.user.isGM) return;
  state = foundry.utils.deepClone(get("board"));
  foragingTerrains().then(options=>{terrainOptions=options;render();}).catch(()=>{});
  root = document.createElement("aside"); root.id = "mlgm"; root.className = "ml-window"; root.setAttribute("aria-label", "Morelord Game Master");
  document.body.append(root);
  root.addEventListener("click", event => {
    const target = event.target.closest("[data-action]");
    if (!target || target.disabled) return;
    target.disabled = true;
    Promise.resolve(act(target.dataset.action, target.dataset.id)).catch(fail).finally(() => { if (target.isConnected) target.disabled = false; });
  });
  new foundry.applications.ux.ContextMenu(root,'[data-macro-uuid]',[{name:"Remove",icon:'<i class="fa-solid fa-trash"></i>',callback:element=>act("unpin-macro",element.dataset.macroUuid).catch(fail)}],{jQuery:false,fixed:true});
  root.addEventListener("submit",event=>{event.preventDefault();const id=event.target.dataset.rollCard;if(id)requestCard(id).catch(fail);});
  root.addEventListener("change", event => onChange(event).catch(fail));
  root.addEventListener("dragover",event=>{if(tab === "macros")event.preventDefault();});
  root.addEventListener("drop",event=>{if(tab === "macros"){event.preventDefault();dropMacro(event).catch(fail);}});
  root.addEventListener("dragstart",event=>{const tile=event.target.closest('[data-macro-uuid]');if(tile)event.dataTransfer.setData('text/plain',JSON.stringify({type:'Macro',uuid:tile.dataset.macroUuid}));});
  root.addEventListener("keydown", event => {
    if (event.key === "Escape") { toggle(false); event.stopPropagation(); }
    const current = event.target.closest('[role="tab"]');
    if (!current) return;
    const ids = Object.keys(tabs), index = ids.indexOf(current.dataset.id);
    const next = event.key === "ArrowRight" ? ids[(index+1)%ids.length] : event.key === "ArrowLeft" ? ids[(index+ids.length-1)%ids.length] : event.key === "Home" ? ids[0] : event.key === "End" ? ids.at(-1) : ["Enter"," "].includes(event.key) ? current.dataset.id : null;
    if (next) { event.preventDefault(); tab = next; render(); root.querySelector(`#mlgm-tab-${next}`).focus(); }
  });
  root.addEventListener("input", event => {
    if (event.target.id === "mlgm-prompt") drafts.set(event.target.dataset.campaign,event.target.value);

  });
  render();
  core().ui.activateCardSelection({element:root});
});

function toggle(value = !open) {
  if (!game.user?.isGM || !root) return;
  open = Boolean(value); document.body.classList.toggle("mlgm-open", open); render();
  root.querySelector(open ? "[role=tab][aria-selected=true]" : ".gm-handle")?.focus();
}
function saved(type) {
  return state.saved.filter(s => s.type === type).map(s => savedButton("saved",savedName(s.type,s.config),s.id,"remove-saved")).join("");
}
function savedName(type,config) {
  if (type === "group" || type === "player") return `${game.i18n.localize(CONFIG.DND5E.skills[config.skill]?.label ?? config.skill)} Check${type === "player" ? ` - ${game.actors.get(config.actorIds?.[0])?.name ?? "Missing character"}` : ""}`;
  if (type === "playlist") return game.playlists.get(config.playlist)?.name ?? "Missing playlist";
  if (type === "ambience") return config.files.map(f=>f.path.split('/').at(-1).replace(/\.[^.]+$/,"")).join(" + ");
  return "Death Saving Throw";
}
function render() {
  if (!root) return;
  root.innerHTML = `<button type="button" data-action="toggle" class="ml-tray-handle gm-handle" aria-expanded="${open}" aria-controls="mlgm-tray" title="${open ? "Close" : "Open"} Game Master"><i class="fa-solid fa-chevron-${open ? "down" : "up"}" aria-hidden="true"></i><span>Game Master</span></button>
    <section id="mlgm-tray" class="window-content gm-tray" ${open ? "" : "hidden"}><div class="ml-app ml-app-shell"><header class="ml-hero"><i class="fa-solid fa-dice-d20 ml-hero__icon" aria-hidden="true"></i><div class="ml-hero__body"><h1>Morelord Game Master</h1><p>Your table, within reach.</p></div><div class="ml-actions">${button("documentation", "Documentation")}</div></header>

    <nav class="ml-tabs ml-compact" role="tablist" aria-label="Game Master tools">${Object.entries(tabs).map(([id, name]) => `<a data-action="tab" data-id="${id}" id="mlgm-tab-${id}" role="tab" tabindex="${tab === id ? 0 : -1}" aria-selected="${tab === id}" aria-controls="mlgm-panel">${e(name)}</a>`).join("")}</nav>
    ${tab === "triggers" ? `<div class="ml-actions gm-trigger-toolbar">${button("new-trigger","+ New Trigger","",'disabled title="Trigger authoring is currently unavailable"')}</div>` : ""}
    <section id="mlgm-panel" class="${["sound","ai"].includes(tab) ? "ml-surface " : ""}ml-grid ml-compact gm-columns" data-columns="${["triggers","macros","party"].includes(tab) ? "1" : "3"}" role="tabpanel" aria-labelledby="mlgm-tab-${tab}">${content()}</section></div></section>`;
  const hotbar=document.querySelector("#hotbar");
  root.style.setProperty("--hotbar-size",`${(Number.parseFloat(hotbar ? getComputedStyle(hotbar).getPropertyValue("--hotbar-size") : "") || 60)*1.5}px`);
  core().ui.applyPageLayout({element:root});
  if (root.querySelector("#mlgm-prompt")) root.querySelector("#mlgm-prompt").value = drafts.get(campaign?.id) ?? "";
}
function content() {
  if (tab === "rolls") return [["fate","encounter","search","foraging","death"],["group",...state.saved.filter(s=>s.type === "group").map(s=>s.id)],["player",...state.saved.filter(s=>s.type === "player").map(s=>s.id)]].map(ids=>`<div class="ml-stack gm-roll-column" data-gap="4">${ids.map(id=>rollCard(id)).join("")}</div>`).join("");
  if (tab === "party") return `<div class="ml-stack"><p>Characters included in party roll requests.</p>${characterChoices(partyActorIds())}</div>`;
  if (tab === "triggers") return `<div class="ml-stack" data-gap="4"><div class="ml-grid" data-columns="3">${triggerCards()}</div></div>`;
  if (tab === "sound") {
    const playing = game.playlists.contents.flatMap(p => p.sounds.filter(s=>s.playing).map(s=>({p,s})));
    const cards = playing.map(({p,s})=>`<div class="ml-card ml-stack"><strong>${e(s.name)}</strong><small>${e(p.name)}</small><div class="ml-item-row"><input type="range" min="0" max="1" step="0.01" value="${s.volume}" data-playlist="${p.id}" data-sound="${s.id}" aria-label="${e(s.name)} volume">${button("stop-sound","Stop",`${p.id}:${s.id}`)}</div></div>`).join("");
    return column("Playlists",`${button("playlist","Start Playlist")}${saved("playlist")}`)
      + column("Ambience",`${button("ambience","Play Ambience")}${saved("ambience")}`)
      + column("Now Playing",cards + (playing.some(({p})=>!p.getFlag(ID,"ambience")) ? button("stop-music","Stop Music") : "") + (playing.some(({p})=>p.getFlag(ID,"ambience")) ? button("stop-ambience","Stop Ambience") : ""));
  }
  if (tab === "macros") return `<div class="gm-macros">${macroButtons()}</div>`;
  return aiContent();
}
function partyActorIds() {
  const eligible=core().ui.participation.listCharacterActors();
  const selected=state.partyActorIds ?? core().ui.participation.listCharacterChoices().filter(c=>c.checked).map(c=>c.uuid.split('.').at(-1));
  return selected.filter(id=>eligible.some(a=>a.id===id));
}
function cardConfig(id) {
  const saved=state.saved.find(s=>s.id===id);
  return {type:saved?.type ?? id,config:saved?.config ?? state.last[id] ?? {},saved};
}
function rollCard(id) {
  if (id === "fate") return `<section class="ml-card ml-stack gm-roll-card"><strong>Roll of Fate</strong><p>Randomly choose one selected character token.</p><div class="ml-actions gm-roll-actions"><button type="button" class="ml-icon-button" data-action="fate" title="Roll of Fate" aria-label="Roll of Fate"><i class="fa-solid fa-dice-d20" aria-hidden="true"></i></button></div></section>`;
  const {type,config:c,saved}=cardConfig(id),actors=partyActorIds().map(id=>game.actors.get(id));
  const titles={encounter:"Encounter Check",search:"Delerium Search",foraging:"Foraging Check",death:"Death Saving Throw",group:"Group Check",player:"Player Check"};
  let fields="";
  if (["player","death"].includes(type)) fields+=label("Character",select("actorId",actors.map(a=>option(a.id,a.name,c.actorIds?.[0] ?? actors[0]?.id)).join("")));
  if (["group","player"].includes(type)) fields+=label("Skill",select("skill",Object.entries(CONFIG.DND5E.skills).map(([key,s])=>option(key,game.i18n.localize(s.label),c.skill ?? "prc")).join("")))+label("DC (optional)",input("dc",c.dc ?? "",'type="number" min="0" step="1"'));
  if (type === "encounter") fields+=label("Die",select("die",[4,6,8,10,12,20].map(d=>option(String(d),`d${d}`,String(c.die ?? state.last.die ?? 8))).join("")));
  if (type === "foraging") fields+=label("Terrain",select("terrainIndex",terrainOptions.map((t,i)=>option(String(i),t.label,String(c.terrainIndex ?? 2))).join("")));
  if (type === "search") {
    let zones=[];try {zones=craftworks().deleriumSearch.getZones();} catch {}
    fields+=label("Search area",select("zoneId",zones.map(z=>option(z.id,`${z.name} - DC ${z.dc}`,c.zoneId ?? zones[0]?.id)).join("")));
  }
  return `<form class="ml-card ml-stack gm-roll-card" data-roll-card="${e(id)}"><strong>${e(saved ? savedName(type,c) : titles[type])}</strong>${fields}<label class="ml-check"><input type="checkbox" name="blind" ${c.blind === true ? "checked" : ""}><span>Blind roll</span></label><div class="ml-actions gm-roll-actions">${saved ? deleteButton("remove-saved",id,savedName(type,c)) : ["group","player"].includes(type) ? `<button type="button" class="ml-icon-button" data-action="card-save" data-id="${e(id)}" title="Save check card" aria-label="Save check card"><i class="fa-solid fa-bookmark" aria-hidden="true"></i></button>` : ""}<button type="button" class="ml-icon-button" data-action="card-roll" data-id="${e(id)}" title="Request rolls" aria-label="Request ${e(titles[type])}" ${actors.length ? "" : "disabled"}><i class="fa-solid fa-dice-d20" aria-hidden="true"></i></button></div></form>`;
}
function readCard(id) {
  const card=[...root.querySelectorAll('[data-roll-card]')].find(el=>el.dataset.rollCard===id),data=new FormData(card),{type}=cardConfig(id);
  const config={kind:{group:"skill",player:"skill",search:"delerium"}[type] ?? type,blind:data.has("blind"),actorIds:["player","death"].includes(type) ? [data.get("actorId")].filter(Boolean) : partyActorIds()};
  if (["group","player"].includes(type)) Object.assign(config,{skill:data.get("skill"),dc:parseDC(data.get("dc"))});
  if (type === "encounter") config.die=Number(data.get("die"));
  if (type === "search") config.zoneId=data.get("zoneId");
  if (type === "foraging") config.terrainIndex=Number(data.get("terrainIndex"));
  return {type,config};
}
async function requestCard(id) {
  await saving;
  const {config}=readCard(id);
  if (!config.actorIds.length) throw new Error("Select participating characters on the Party tab first.");
  await persist(n=>{const saved=n.saved.find(s=>s.id===id);if(saved)saved.config=config;else n.last[id]=config;});
  await createRequest(config);
}
function macroButtons() {
  return (get("macros") ?? []).map(uuid=>{const macro=fromUuidSync(uuid),name=macro?.name ?? "Missing macro";return `<button type="button" class="ml-action-pad" data-size="hotbar" draggable="true" data-macro-uuid="${e(uuid)}" data-action="macro" data-id="${e(uuid)}" title="${e(name)}" aria-label="${e(name)}"><img src="${e(macro?.img ?? "icons/svg/dice-target.svg")}" alt="" width="40" height="40" draggable="false"></button>`;}).join("");
}
async function dropMacro(event) {
  gm();
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data.type !== "Macro") throw new Error("Drag a macro into this panel.");
  let macro = await Macro.fromDropData(data);
  if (!macro) throw new Error("Macro not found.");
  if (macro.inCompendium) macro = await Macro.create(macro.toObject());
  const pinned = (get("macros") ?? []).filter(uuid=>uuid !== macro.uuid);
  const before = event.target.closest('[data-macro-uuid]')?.dataset.macroUuid;
  if (before === macro.uuid) return;
  const index = pinned.indexOf(before);
  pinned.splice(index < 0 ? pinned.length : index,0,macro.uuid);
  await game.settings.set(ID,"macros",pinned);render();
}

async function act(action, id) {
  gm();
  if (action === "toggle") return toggle();
  if (action === "tab") { tab = id; render(); return; }
  if (action === "card-roll") return requestCard(id);
  if (action === "card-save") {const {type,config}=readCard(id);await saveAndRun(type,config);return;}
  if (action === "settings") return settings();
  if (action === "new-trigger" || action === "trigger-edit" || action === "trigger-remove") return;
  if (action === "fate") return rollOfFate();
  if (action === "unpin-macro") {await game.settings.set(ID,"macros",(get("macros") ?? []).filter(uuid=>uuid !== id));render();return;}
  if (action === "documentation") return core().ui.documentation.open(ID);
  if (action === "scenario") { const s = state.scenarios.find(x => x.id === id); if (s) { await persist(n => { n.last.die = s.die; }); await encounter(s.die, s.name, s.actorIds); } }
  if (action.startsWith("remove-")) { const key = action === "remove-saved" ? "saved" : "scenarios"; await persist(n => { n[key] = n[key].filter(x => x.id !== id); }); }
  if (action === "saved") { const s = state.saved.find(x => x.id === id); if (s) await run(s.type, s.config); }
  if (action === "playlist") return playlistForm();
  if (action === "ambience") return ambienceForm();
  if (action === "stop-music" || action === "stop-ambience") for (const p of game.playlists) if (Boolean(p.getFlag(ID,"ambience")) === (action === "stop-ambience")) await p.stopAll();
  if (action === "stop-sound") { const [p,s] = id.split(":"); await game.playlists.get(p)?.sounds.get(s)?.update({playing:false}); }
  if (action === "macro") { const m = await fromUuid(id); if (!m?.canExecute) throw new Error("That macro is no longer available."); await m.execute(); notify(`Launched ${m.name}.`); }
  if (action === "trigger-toggle") await persist(n => { const t = n.triggers.find(x => x.id === id); if (t) t.enabled = !t.enabled; });

  if (action.startsWith("ai-")) return aiAction(action, id);
  render();
}
async function onChange(event) {
  const el = event.target;
  if (tab === "party" && el.name === "actorUuids") {
    const ids=[...root.querySelectorAll('[name="actorUuids"]:checked')].map(el=>el.value.split('.').at(-1));
    await persist(n=>{n.partyActorIds=ids;});return;
  }
  const card=el.closest('[data-roll-card]');
  if (card) {
    const {config}=readCard(card.dataset.rollCard),id=card.dataset.rollCard;
    await persist(n=>{const saved=n.saved.find(s=>s.id===id);if(saved)saved.config=config;else n.last[id]=config;});return;
  }
  if (el.dataset.sound) { gm(); await game.playlists.get(el.dataset.playlist)?.sounds.get(el.dataset.sound)?.update({ volume: Number(el.value) }); }
  if (el.id === "mlgm-campaign") {
    const sequence = ++campaignSelection;
    const selected = el.value ? await api(`/campaigns/${encodeURIComponent(el.value)}`) : null;
    if (sequence === campaignSelection) { campaign = selected; render(); }
  }
  if (el.id === "mlgm-upload") await uploadFiles(el.files);
}
async function run(type, config) {
  if (["group", "player", "death"].includes(type)) await createRequest({...config,...(type === "group" ? {actorIds:partyActorIds()} : {}),kind:type === "death" ? "death" : "skill"});
  if (type === "playlist") {
    const p = game.playlists.get(config.playlist);
    if (!p) throw new Error("The saved playlist no longer exists.");
    if (!p.sounds.size) throw new Error("Add tracks to this playlist before starting it.");
    for (const music of game.playlists.filter(m => !m.getFlag(ID,"ambience") && (m.playing || m.sounds.some(s => s.playing || s.pausedTime)))) await music.stopAll();
    await p.update({mode:CONST.PLAYLIST_MODES.SHUFFLE});
    await p.updateEmbeddedDocuments("PlaylistSound", p.sounds.map(s => ({ _id:s.id, volume:config.volume })));
    await p.playAll(); notify(`Playing ${p.name}.`);
  }
  if (type === "ambience") {
    let p = game.playlists.find(p => p.getFlag(ID,"ambience"));
    if (!p) p = await Playlist.create({ name:"Morelord · Ambience", mode:CONST.PLAYLIST_MODES.SIMULTANEOUS, flags:{[ID]:{ambience:true}} });
    for (const file of config.files) {
      let sound = p.sounds.find(s => s.path === file.path);
      if (!sound) [sound] = await p.createEmbeddedDocuments("PlaylistSound", [{ name:file.path.split("/").pop(), path:file.path, repeat:true, volume:file.volume }]);
      await sound.update({ playing:true, repeat:true, volume:file.volume });
    }
    notify("Ambience layers started for the table.");
  }
}
async function saveAndRun(type, config) {
  const name = savedName(type,config);
  await persist(n => {
    n.last[type] = config;
    const existing = n.saved.find(s=>s.type === type && savedName(s.type,s.config) === name);
    if (existing) Object.assign(existing,{name,config});
    else n.saved.push({id:foundry.utils.randomID(),type,name,config});
  });
  render();
}
function characterDropdown(actorId) {
  const actors = core().ui.participation.listCharacterActors();
  return label("Player / character",`<select name="actorUuids" data-mlgm-character>${actors.map(a=>option(a.uuid,`${a.name} - ${recipient(a)?.name ?? "GM"}`,game.actors.get(actorId)?.uuid ?? actors[0]?.uuid)).join("")}</select>`);
}
Hooks.on("renderDialogV2",(app,html)=>{for(const field of html.querySelectorAll?.('[data-mlgm-character]') ?? [])core().ui.decorateActorSelect(field);});
function parseDC(value) { if (value === null || String(value).trim() === "") return null; const dc = Number(value); if (!Number.isInteger(dc) || dc < 0) throw new Error("DC must be a non-negative whole number or blank."); return dc; }
function characterChoices(actorIds, single = false) {
  const selectedUuids = actorIds ? actorIds.map(id => game.actors.get(id)?.uuid).filter(Boolean) : null;
  const choices = core().ui.participation.listCharacterChoices({selectedUuids});
  const singleUuid = choices.find(c => c.checked)?.uuid ?? choices[0]?.uuid;
  return `<section class="ml-surface ml-stack" data-gap="3"><div class="ml-section-heading"><div><h2>Verify characters</h2><p>Participants and roll recipients</p></div></div><div class="ml-actor-choice-grid">${choices.map(c => {
    const actor = game.actors.get(c.uuid.split(".").at(-1)), target = recipient(actor);
    return `<label class="ml-actor-choice"><input type="${single ? "radio" : "checkbox"}" name="actorUuids" value="${e(c.uuid)}" ${(single ? c.uuid === singleUuid : c.checked) ? "checked" : ""}><img src="${e(c.img)}" alt=""><span>${e(c.name)}<br><small>${e(target?.isGM ? `GM · ${target.name} (no active player)` : target?.name ?? "No active GM")}</small></span></label>`;
  }).join("")}</div></section>`;
}
function selectedActors(data) { return core().ui.participation.selectedCharacterUuids(data).map(uuid => uuid.split(".").at(-1)); }
async function verifyCharacters(actorIds,{single=false,title="Verify characters"}={}) {
  const result = await form(title,characterChoices(actorIds,single),[["run","Confirm & request"]]);
  if (!result) return null;
  const ids = selectedActors(result.data);
  if (!ids.length) throw new Error("Select at least one character.");
  return ids;
}
async function encounter(die,name,selected) {
  gm();
  if (!Number.isInteger(die) || die < 2 || die > 1000) throw new Error("Invalid encounter die.");
  const actorIds = await verifyCharacters(selected ?? state.last.encounter?.actorIds,{title:`Encounter Check · 1d${die}`});
  if (!actorIds) return;
  await persist(n => {n.last.encounter = {actorIds};});
  await createRequest({kind:"encounter",die,name,actorIds});
  notify(`Requested blind 1d${die} encounter checks.`);
}
async function playlistForm() {
  const playlists = game.playlists.filter(p => !p.getFlag(ID,"ambience"));
  if (!playlists.length) throw new Error("Create a playlist in Foundry first.");
  const last = state.last.playlist ?? { volume:0.65 };
  const result = await form("Start Playlist",label("Playlist",select("playlist",playlists.map(p => option(p.id,p.name,last.playlist)).join(""))) + label("Volume (%)",input("volume",last.volume*100,'type="number" min="0" max="100" required')) , [["save","Save button"]]);
  if (result) await saveAndRun("playlist",{playlist:result.data.get("playlist"), volume:volume(result.data.get("volume"))},result);
}
function volume(value) { const n = Number(value); if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error("Volume must be between 0 and 100."); return n / 100; }
async function ambienceForm() {
  const browser = await foundry.applications.apps.FilePicker.browse("data",get("ambienceFolder"));
  const files = browser.files.filter(f => /\.(mp3|ogg|wav|flac|webm|m4a)$/i.test(f));
  if (!files.length) throw new Error("No audio files found in the configured Ambience folder.");
  const last = state.last.ambience?.files ?? [];
  const result = await form("Play Ambience",`<fieldset class="ml-stack"><legend>Layers and volume (%)</legend>${files.map((path,i) => { const prev = last.find(f => f.path === path); return `<div class="ml-card ml-item-row"><label class="ml-check"><input type="checkbox" name="file" value="${i}" ${prev ? "checked" : ""}><span>${e(path.split("/").pop())}</span></label>${label("Volume (%)",input(`volume${i}`,(prev?.volume ?? .4)*100,'type="number" min="0" max="100" required'))}</div>`; }).join("")}</fieldset>` , [["save","Save button"]]);
  if (!result) return;
  const selected = result.data.getAll("file").map(i => ({path:files[Number(i)],volume:volume(result.data.get(`volume${i}`))}));
  if (!selected.length) throw new Error("Select at least one sound.");
  await saveAndRun("ambience",{files:selected},result);
}

export async function requestCheck(config) {
  gm();
  const actorIds = await verifyCharacters(config.actorIds, {single:config.kind === "death", title:config.kind === "death" ? "Death Saving Throw" : "Verify characters"});
  if (!actorIds) return;
  const message = await createRequest({...config,actorIds});
  notify("Check requested. Core routes online players and offline GM fallbacks.");
  render();
  return message;
}
for (const hook of ["morelordGameMasterTriggersChanged","createChatMessage","deleteChatMessage","updateChatMessage","updatePlaylist","updatePlaylistSound","createMacro","updateMacro","deleteMacro","updateUser"]) Hooks.on(hook, () => { if (open && tab !== "ai") render(); });
Hooks.on("updateSetting", setting => { if (setting.key === `${ID}.macros` && game.user.isGM) render(); if (setting.key === `${ID}.board` && game.user.isGM) { state = foundry.utils.deepClone(get("board")); render(); } });

export async function addTrigger({name,actorId,itemId,tableId,tableUuid,kind="item",id,gameMinutes=10,realMinutes=1}) {
  gm();
  const actor=game.actors.get(actorId),item=actor?.items.get(itemId);
  if ((kind === "item" && !actor) || !["item","sorcerer","volatile","sneak","lucky-find","world-clock"].includes(kind)) throw new Error("Choose a character and trigger condition.");
  if (kind === "item" && !item) throw new Error("Choose the character's item or feature.");
  const table=kind === "lucky-find" ? luckyFindWorldTable() : ["sneak","world-clock"].includes(kind) ? null : await fromUuid(tableUuid ?? `RollTable.${tableId}`);
  if (!["sneak","world-clock"].includes(kind) && !table) throw new Error(kind === "lucky-find" ? "Import the Lucky Finds table into this world first." : "Choose a valid roll-table UUID.");
  if (kind === "world-clock" && id && state.triggers.some(t=>t.kind === kind && t.id !== id)) throw new Error("Edit the existing World Clock trigger instead.");
  const interval=kind === "world-clock" ? clockInterval({gameMinutes,realMinutes}) : {};
  const trigger={macroUuid:triggerMacroUuid(kind),...interval,sourceWorld:game.world?.id,id:id ?? foundry.utils.randomID(),name:name?.trim() || (kind === "world-clock" ? "World Clock" : kind === "sneak" ? "Sneak Attack" : table.name),actorId:kind === "item" ? actorId : null,itemId:kind === "item" ? itemId : null,tableUuid:table?.uuid,tableId:table?.id,kind,actorName:kind === "item" ? actor.name : null,itemName:item?.name,tableName:table?.name,enabled:false,createdBy:game.user.id};
  await persist(n=>{const existing=n.triggers.find(t=>id ? t.id===id : t.kind===kind && (kind !== "item" || (t.actorId===actorId && t.itemId===itemId && t.tableUuid===trigger.tableUuid)));if(existing){trigger.id=existing.id;trigger.enabled=existing.enabled;Object.assign(existing,trigger);}else n.triggers.push(trigger);});
  render();return trigger;
}
function triggerCards() {
  return state.triggers.map(t=>`<article class="ml-card ml-stack gm-trigger-card"><div class="ml-item-row"><div class="ml-stack"><strong>${e(t.kind === "world-clock" ? "World time" : t.kind === "lucky-find" ? "Combat completed" : t.kind === "sneak" ? "Any rogue" : t.kind === "volatile" ? "Any character" : t.kind === "sorcerer" ? "Any Wild Magic sorcerer" : game.actors.get(t.actorId)?.name ?? t.actorName)}</strong><span>${e(t.name)}</span><small>${e(triggerStatus(t.id))}</small></div></div><p>When: ${e(t.kind === "world-clock" ? "Game unpaused and no started combat" : t.kind === "lucky-find" ? "A started combat ends" : t.kind === "volatile" ? "A character rolls a spell attack, or completes any spell without an attack" : t.kind === "sorcerer" ? "A Wild Magic sorcerer rolls a spell attack, or casts a Sorcerer spell without an attack" : t.kind === "sneak" ? "A rogue completes weapon damage for a qualifying Sneak Attack hit" : `Uses ${t.itemName}`)}</p><p>Then: ${e(t.kind === "world-clock" ? `Add ${t.gameMinutes ?? 10} game minutes every ${t.realMinutes ?? 1} real minutes. Combat adds 6 seconds per round when it ends.` : t.kind === "lucky-find" ? "Roll the world Lucky Finds table for the GM, once per combat" : t.kind === "sneak" ? "Roll Sneak Attack damage (once per turn)" : ["sorcerer","volatile"].includes(t.kind) ? `Request d20; start at 1 or lower to roll ${t.tableName}. Increase on a miss; reset after a surge. Tracked separately for each character and trigger.` : `Roll ${t.tableName}`)}</p><footer class="ml-card__footer ml-actions gm-trigger-actions"><span class="ml-status gm-trigger-status" data-tone="${t.enabled ? "success" : "muted"}" role="img" title="${e(triggerStatus(t.id))}" aria-label="${e(triggerStatus(t.id))}"><i class="fa-solid ${t.enabled ? "fa-circle-check" : "fa-circle-pause"}" aria-hidden="true"></i></span><button type="button" class="ml-icon-button" data-action="trigger-toggle" data-id="${e(t.id)}" aria-pressed="${Boolean(t.enabled)}" title="${t.enabled ? "Pause trigger" : "Enable trigger"}" aria-label="${t.enabled ? "Pause trigger" : "Enable trigger"}"><i class="fa-solid ${t.enabled ? "fa-pause" : "fa-play"}" aria-hidden="true"></i></button></footer></article>`).join("");
}

async function settings() {
  const result = await form("Game Master settings",label("Ambience folder",input("folder",get("ambienceFolder"))) + label("AI companion URL",input("url",get("companion"),'type="url" required')) + label("Companion token (this tab only)",input("token",sessionStorage.getItem(`${ID}.token`) ?? "",'type="password" autocomplete="off"')) + '<p>Provider API keys belong in the companion environment, never in Foundry settings.</p>');
  if (!result) return;
  const url = companionURL(result.data.get("url"));
  await game.settings.set(ID,"ambienceFolder",result.data.get("folder").trim());
  await game.settings.set(ID,"companion",url);
  sessionStorage.setItem(`${ID}.token`,result.data.get("token").trim()); connection = null; campaign = null; campaigns = []; render();
}
async function api(path, method="GET", body) {
  const response = await fetch(companionURL(get("companion")) + path, {method, headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionStorage.getItem(`${ID}.token`) ?? ""}`}, body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(180000)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Companion returned ${response.status}.`);
  return data;
}
function aiContent() {
  return column("Campaign context", `${button("ai-connect",connection ? "Refresh connection" : "Connect companion")}<p class="notes">${connection ? e(connection.configured ? `OpenAI API · ${connection.model}` : "Library connected · API model/key not configured") : "Not connected. Open Game settings to enter your companion token."}</p><label class="ml-field-label" for="mlgm-campaign">Campaign</label><select id="mlgm-campaign"><option value="">Select a campaign</option>${campaigns.map(c => option(c.id,c.name,campaign?.id)).join("")}</select>${button("ai-create","＋ New campaign","",connection ? "" : "disabled")}${campaign ? `<p>${e(campaign.rules)}</p>${button("ai-edit","Edit notes & rules")}<h3 class="ml-field-label">Campaign files</h3><label class="ml-field-label" for="mlgm-upload">Upload PDFs or text</label><input id="mlgm-upload" type="file" accept=".pdf,.txt,.md" multiple ${aiBusy ? "disabled" : ""}>${campaign.files.map(f => `<div class="ml-card ml-stack"><strong>${e(f.name)}</strong><p class="notes">Stored · ${Math.ceil(f.size/1024)} KB · supplied with each question</p>${deleteButton("ai-remove-file",f.id,f.name)}</div>`).join("")}<p class="notes">Files are stored privately by the companion. PDF readability is checked by the provider when you ask a question.</p>` : ""}`)
    + column("Ask your campaign assistant", `<div class="ml-item-row"><span class="notes">GM private · ${e(campaign?.name ?? "Choose a campaign")}</span>${button("ai-export","Export conversation","",campaign ? "" : "disabled")}</div><div class="gm-chat" role="log" aria-live="polite">${campaign?.messages.map(m => `<article class="ml-card ml-stack"><strong>${m.role === "user" ? "You" : "Game Master assistant"}</strong><br>${e(m.content)}</article>`).join("") || '<p class="notes">Campaign notes, files, and conversation stay separate for each campaign.</p>'}</div><label class="ml-field-label" for="mlgm-prompt">Message</label><textarea id="mlgm-prompt" data-campaign="${e(campaign?.id)}" rows="2" maxlength="12000" placeholder="Ask about your campaign, a rule, or the next encounter…"></textarea><label class="ml-check"><input type="checkbox" id="mlgm-scene"><span>Include current scene and party</span></label>${button("ai-send",aiBusy ? "Thinking…" : "Send","",(!campaign || !connection?.configured || aiBusy) ? "disabled" : 'class="ml-button" data-tone="accent" data-variant="outline"')}<p class="notes">Sending shares this campaign’s notes, files and recent conversation with OpenAI. No Foundry actions are executed by AI.</p>`,"gm-span");
}
async function aiAction(action,id) {
  if (action === "ai-connect") { connection = await api("/health"); campaigns = await api("/campaigns"); if (campaign) campaign = await api(`/campaigns/${campaign.id}`); notify("Campaign companion connected."); }
  if (action === "ai-create" || action === "ai-edit") {
    const existing = action === "ai-edit" ? campaign : null;
    const result = await form(existing ? "Campaign notes" : "New campaign", label("Campaign name",input("name",existing?.name ?? "",'required maxlength="100"')) + label("Rules edition",select("rules",["D&D 5e · 2024","D&D 5e · 2014","Other"].map(x => option(x,x,existing?.rules)).join(""))) + label("Durable campaign notes / instructions",`<textarea name="notes" rows="8" maxlength="50000">${e(existing?.notes ?? "")}</textarea>`));
    if (!result) return;
    const body = Object.fromEntries(result.data);
    campaign = await api(existing ? `/campaigns/${existing.id}` : "/campaigns",existing ? "PATCH" : "POST",body);
    campaigns = await api("/campaigns");
  }
  if (action === "ai-remove-file" && campaign) { await api(`/campaigns/${campaign.id}/files/${id}`,"DELETE"); campaign = await api(`/campaigns/${campaign.id}`); }
  if (action === "ai-send" && campaign && !aiBusy) {
    const prompt = root.querySelector("#mlgm-prompt").value.trim();
    if (!prompt) return;
    const campaignId = campaign.id;
    const context = root.querySelector("#mlgm-scene").checked ? {scene:canvas.scene?.name ?? "",party:core().ui.participation.listCharacterActors().map(a => a.name)} : undefined;
    aiBusy = true; render(); notify("Waiting for the campaign assistant…");
    try { const updated = await api(`/campaigns/${campaignId}/chat`,"POST",{prompt,context}); drafts.delete(campaignId); if (campaign?.id === campaignId) campaign = updated; notify("Campaign answer received."); }
    finally { aiBusy = false; render(); }
  }
  if (action === "ai-export" && campaign) {
    const text = `# ${campaign.name}\n\n${campaign.rules}\n\n${campaign.notes}\n\n${campaign.messages.map(m => `## ${m.role}\n\n${m.content}`).join("\n\n")}`;
    const url = URL.createObjectURL(new Blob([text],{type:"text/markdown"})), a = document.createElement("a");
    a.href = url; a.download = `${campaign.name.replace(/[^\w -]/g,"") || "campaign"}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
  }
  render();
}
async function uploadFiles(files) {
  if (!campaign) throw new Error("Choose a campaign first.");
  const id = campaign.id;
  for (const file of files) {
    if (file.size > 10*1024*1024) throw new Error("Each file must be 10 MB or smaller.");
    notify(`Uploading ${file.name}…`);
    const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(",")[1]); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    await api(`/campaigns/${id}/files`,"POST",{name:file.name,data});
  }
  if (campaign?.id === id) campaign = await api(`/campaigns/${id}`);
  notify("Campaign files stored."); render();
}
