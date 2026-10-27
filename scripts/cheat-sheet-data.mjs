// Paraphrased D&D quick reference from the System Reference Document 5.2.1.
// The English strings are the fallback when Foundry's language file has not loaded.
// Keep lang/en.json aligned with cheatStringEntries().
import { DRAKKENHEIM_CONDITIONS, DRAKKENHEIM_ITEMS } from "./cheat-sheet-drakkenheim.mjs";

export const CHEAT_SECTIONS = [
  {
    id: "conditions",
    title: "Conditions",
    items: [
      { id: "blinded", label: "Blinded", lines: [
        "You can't see, and you automatically fail any ability check that requires sight.",
        "Attack rolls against you have Advantage, and your attack rolls have Disadvantage."
      ] },
      { id: "charmed", label: "Charmed", lines: [
        "You can't attack the charmer or target the charmer with damaging abilities or magical effects.",
        "The charmer has Advantage on ability checks to interact with you socially."
      ] },
      { id: "deafened", label: "Deafened", lines: [
        "You can't hear, and you automatically fail any ability check that requires hearing."
      ] },
      { id: "frightened", label: "Frightened", lines: [
        "You have Disadvantage on ability checks and attack rolls while the source of fear is in line of sight.",
        "You can't willingly move closer to the source of fear."
      ] },
      { id: "grappled", label: "Grappled", lines: [
        "Your Speed is 0 and can't increase.",
        "You have Disadvantage on attack rolls against any target other than the grappler.",
        "The grappler can drag or carry you. Each foot of that movement costs 1 extra foot unless you are Tiny or two or more sizes smaller.",
        "Use your action for a Strength (Athletics) or Dexterity (Acrobatics) check against the escape DC. The condition also ends if the grappler is Incapacitated, the distance exceeds the grapple's range, or the grappler lets go."
      ] },
      { id: "incapacitated", label: "Incapacitated", lines: [
        "You can't take an action, a Bonus Action, or a Reaction.",
        "Your Concentration is broken, and you can't speak.",
        "If you are Incapacitated when you roll Initiative, you have Disadvantage on the roll."
      ] },
      { id: "invisible", label: "Invisible", lines: [
        "If you are Invisible when you roll Initiative, you have Advantage on the roll.",
        "An effect that must see its target doesn't affect you unless its creator can see you. Equipment you wear or carry is concealed as well.",
        "Attack rolls against you have Disadvantage, and your attack rolls have Advantage. You don't gain this against a creature that can see you."
      ] },
      { id: "paralyzed", label: "Paralyzed", lines: [
        "You have the Incapacitated condition. Your Speed is 0 and can't increase.",
        "You automatically fail Strength and Dexterity saving throws.",
        "Attack rolls against you have Advantage.",
        "A hit from an attacker within 5 feet is a Critical Hit."
      ] },
      { id: "petrified", label: "Petrified", lines: [
        "You and the nonmagical objects you wear or carry become a solid inanimate substance, usually stone. Your weight increases tenfold, and you stop aging.",
        "You have the Incapacitated condition. Your Speed is 0 and can't increase.",
        "Attack rolls against you have Advantage, and you automatically fail Strength and Dexterity saving throws.",
        "You have Resistance to all damage and Immunity to the Poisoned condition."
      ] },
      { id: "poisoned", label: "Poisoned", lines: [
        "You have Disadvantage on attack rolls and ability checks."
      ] },
      { id: "prone", label: "Prone", lines: [
        "You can only crawl, or spend movement equal to half your Speed (round down) to stand and end the condition. You can't stand if your Speed is 0.",
        "You have Disadvantage on attack rolls.",
        "An attack roll against you has Advantage if the attacker is within 5 feet. Otherwise that attack roll has Disadvantage."
      ] },
      { id: "restrained", label: "Restrained", lines: [
        "Your Speed is 0 and can't increase.",
        "Attack rolls against you have Advantage, and your attack rolls have Disadvantage.",
        "You have Disadvantage on Dexterity saving throws."
      ] },
      { id: "stunned", label: "Stunned", lines: [
        "You have the Incapacitated condition.",
        "You automatically fail Strength and Dexterity saving throws.",
        "Attack rolls against you have Advantage."
      ] },
      { id: "unconscious", label: "Unconscious", lines: [
        "You have the Incapacitated and Prone conditions, and you drop whatever you are holding. You stay Prone when this ends.",
        "Your Speed is 0 and can't increase. You are unaware of your surroundings.",
        "You automatically fail Strength and Dexterity saving throws. Attack rolls against you have Advantage.",
        "A hit from an attacker within 5 feet is a Critical Hit."
      ] }
    ]
  },
  {
    id: "actions",
    title: "Actions in combat",
    items: [
      { id: "attack", label: "Attack", lines: [
        "Make one attack roll with a weapon or an Unarmed Strike.",
        "You can equip or unequip one weapon before or after that attack. Equipping includes drawing or picking it up. Unequipping includes sheathing, stowing, or dropping it.",
        "If this action gives you more than one attack, you can move between those attacks."
      ] },
      { id: "grapple", label: "Grapple", parts: [
        { heading: "Check", lines: [
          "Unarmed Strike within 5 feet. Target at most one size larger. One free hand.",
          "Target picks a Strength or Dexterity saving throw.",
          "DC and escape DC: 8 plus your Strength modifier and Proficiency Bonus.",
          "Fail: Grappled."
        ] },
        { heading: "While grappled", lines: [
          "Speed is 0 and can't increase.",
          "Disadvantage on attack rolls against any target other than you.",
          "Drag: each foot costs 1 extra foot, unless Tiny or two or more sizes smaller."
        ] },
        { heading: "End", lines: [
          "Action: Strength (Athletics) or Dexterity (Acrobatics) vs the escape DC.",
          "Also ends if you are Incapacitated, the range is exceeded, or you let go."
        ] }
      ] },
      { id: "shove", label: "Shove", lines: [
        "Unarmed Strike within 5 feet. Target at most one size larger.",
        "Target picks a Strength or Dexterity saving throw. DC: 8 plus your Strength modifier and Proficiency Bonus.",
        "Fail: push it 5 feet away or give it the Prone condition."
      ] },
      { id: "dash", label: "Dash", lines: [
        "You gain extra movement equal to your Speed after modifiers. A Speed of 30 feet lets you move up to 60 feet. If that Speed is 15 feet, you can move up to 30 feet.",
        "You can use a special speed, such as a Fly Speed, instead of your Speed. Choose each time you Dash."
      ] },
      { id: "disengage", label: "Disengage", lines: [
        "Your movement doesn't provoke Opportunity Attacks for the rest of the current turn."
      ] },
      { id: "dodge", label: "Dodge", lines: [
        "Until the start of your next turn, attack rolls against you have Disadvantage if you can see the attacker, and you make Dexterity saving throws with Advantage.",
        "You lose these benefits if you have the Incapacitated condition or if your Speed is 0."
      ] },
      { id: "help", label: "Help", parts: [
        { heading: "Ability check", lines: [
          "Name one skill or tool you know, and a nearby ally.",
          "Advantage on that ally's next check with it before your next turn."
        ] },
        { heading: "Attack", lines: [
          "Distract an enemy within 5 feet.",
          "The next ally attack against it has Advantage. Ends at your next turn."
        ] },
        { heading: "First aid", lines: ["You can also give first aid."] }
      ] },
      { id: "hide", label: "Hide", parts: [
        { heading: "Check", lines: [
          "DC 15 Dexterity (Stealth).",
          "You are Heavily Obscured, or behind Three-Quarters or Total Cover, and out of sight."
        ] },
        { heading: "Hidden", lines: [
          "Success: Invisible while hidden.",
          "Your total is the Wisdom (Perception) DC to find you."
        ] },
        { heading: "End", lines: [
          "A sound louder than a whisper, being found, an attack roll, or a spell with a Verbal component."
        ] }
      ] },
      { id: "influence", label: "Influence", parts: [
        { heading: "Attitude", lines: [
          "Willing: it complies. Unwilling: it doesn't. No check.",
          "Hesitant: ability check. The DC is 15 or the monster's Intelligence, whichever is higher."
        ] },
        { heading: "Skills", lines: [
          "Deception, Intimidation, Performance, or Persuasion to talk.",
          "Animal Handling to coax a Beast or Monstrosity.",
          "Friendly: Advantage. Hostile: Disadvantage."
        ] },
        { heading: "Failure", lines: ["Wait 24 hours, or a time the GM sets, before the same request."] }
      ] },
      { id: "magic", label: "Magic", parts: [
        { lines: ["Cast a spell that takes an action, or use a feature or item that needs a Magic action."] },
        { heading: "Longer casting", lines: [
          "1 minute or more: Magic action each turn, and you concentrate.",
          "If Concentration breaks, the spell fails and you don't spend a slot."
        ] }
      ] },
      { id: "ready", label: "Ready", parts: [
        { heading: "Trigger", lines: [
          "Choose a trigger you can perceive, and an action or a move up to your Speed.",
          "Reaction before your next turn, or ignore it."
        ] },
        { heading: "Spell", lines: [
          "Casting time must be an action. Spend the resources now.",
          "Hold with Concentration until your next turn. If it breaks, the spell is lost."
        ] }
      ] },
      { id: "search", label: "Search", lines: [
        "Make a Wisdom check to notice something that isn't obvious."
      ], table: {
        caption: "Search skills",
        headers: ["Skill", "Detect"],
        rows: [
          ["Insight", "A creature's state of mind"],
          ["Medicine", "An ailment or cause of death"],
          ["Perception", "A concealed creature or object"],
          ["Survival", "Tracks or food"]
        ]
      } },
      { id: "study", label: "Study", lines: [
        "Make an Intelligence check to study your memory, a book, a clue, or another source and recall something important."
      ], table: {
        caption: "Areas of knowledge",
        headers: ["Skill", "Topics"],
        rows: [
          ["Arcana", "Spells, magic items, symbols, traditions, planes, and Aberrations, Constructs, Elementals, Fey, and Monstrosities"],
          ["History", "Events, people, civilizations, wars, and Giants and Humanoids"],
          ["Investigation", "Traps, ciphers, riddles, and gadgetry"],
          ["Nature", "Terrain, flora, weather, and Beasts, Dragons, Oozes, and Plants"],
          ["Religion", "Deities, rites, symbols, cults, and Celestials, Fiends, and Undead"]
        ]
      } },
      { id: "utilize", label: "Utilize", lines: [
        "Use a nonmagical object that needs your action.",
        "One free object interaction during your move or action. A second one takes Utilize."
      ] },
      { id: "opportunity", label: "Opportunity", lines: [
        "A creature you can see leaves your reach: Reaction, one melee attack, just before it leaves.",
        "Disengage, teleport, or forced movement that spends no movement, action, Bonus Action, or Reaction does not provoke."
      ] },
      { id: "bonus", label: "Bonus Action", lines: [
        "You have a Bonus Action only when a rule says you do, and you can take only one on your turn.",
        "Anything that stops you from taking actions also stops a Bonus Action."
      ] },
      { id: "reaction", label: "Reaction", lines: [
        "A Reaction answers a trigger, on your turn or someone else's, immediately after the trigger unless its rule says otherwise.",
        "After you take one, you can't take another until the start of your next turn. An Opportunity Attack is a Reaction anyone can take."
      ] },
      { id: "improvise", label: "Improvise", lines: [
        "You take only one action at a time.",
        "If you describe an action the rules don't list, the GM decides whether it is possible and what D20 Test it needs, if any."
      ] }
    ]
  },
  {
    id: "damage",
    title: "Improvising damage",
    items: [
      { id: "nuisance", label: "Nuisance", lines: [
        "A nuisance trap is unlikely to seriously harm characters of the levels it is built for.",
        "The same trap can be deadly for characters below that level range."
      ] },
      { id: "deadly", label: "Deadly", lines: [
        "A deadly trap can grievously damage characters of the levels it is built for.",
        "Use a lower-level trap with care. What is a nuisance higher up can be deadly further down."
      ] },
      { id: "by-level", label: "By level", lines: [
        "The SRD scales sample traps by the levels they are built for. These dice are examples, not one damage formula for every hazard."
      ], table: {
        caption: "Sample trap damage by level",
        headers: ["Levels", "Hidden pit", "Collapsing roof", "Fire statue"],
        rows: [
          ["1–4", "1d6", "2d10", "2d10"],
          ["5–10", "3d6", "4d10", "4d10"],
          ["11–16", "6d6", "10d10", "10d10"],
          ["17–20", "12d6", "18d10", "18d10"]
        ]
      } },
      { id: "fall", label: "Falling", lines: [
        "1d6 Bludgeoning per 10 feet, maximum 20d6.",
        "Then Prone, unless the fall dealt no damage.",
        "Into a liquid: Reaction, DC 15 Strength (Athletics) or Dexterity (Acrobatics). Success halves the damage."
      ] },
      { id: "suffocating", label: "Suffocating", lines: [
        "Hold your breath for minutes equal to 1 plus your Constitution modifier (minimum 30 seconds).",
        "Then 1 Exhaustion level at the end of each of your turns.",
        "Breathing again removes the Exhaustion levels you gained from suffocating."
      ] },
      { id: "drowning", label: "Drowning", lines: [
        "A creature that cannot breathe while underwater uses Suffocating."
      ] },
      { id: "burning", label: "Burning", lines: [
        "A burning creature or object takes 1d4 Fire damage at the start of each of its turns.",
        "As an action, you can put yourself out by giving yourself the Prone condition and rolling on the ground. The fire also ends if it is doused, submerged, or suffocated."
      ] },
      { id: "pit", label: "Hidden pit", lines: [
        "Nuisance at levels 1–4. A 10-foot pit deals 1d6 Bludgeoning.",
        "At higher levels: 30 feet and 3d6 (levels 5–10), 60 feet and 6d6 (11–16), or 120 feet and 12d6 (17–20)."
      ] },
      { id: "roof", label: "Collapsing roof", lines: [
        "Deadly at levels 1–4. Creatures under the ceiling make a DC 13 Dexterity save, taking 2d10 Bludgeoning on a failure or half on a success. The rubble is Difficult Terrain.",
        "At higher levels the damage and DC become 4d10 and 15 (levels 5–10), 10d10 and 17 (11–16), or 18d10 and 19 (17–20)."
      ] },
      { id: "statue", label: "Fire statue", lines: [
        "Deadly at levels 1–4. A 15-foot Cone, DC 15 Dexterity save, 2d10 Fire on a failure or half on a success.",
        "At higher levels: 4d10 in a 30-foot Cone (levels 5–10), 10d10 in a 60-foot Cone (11–16), or 18d10 in a 120-foot Cone (17–20)."
      ] },
      { id: "spikes", label: "Spiked pit", lines: [
        "Deadly at levels 1–4. A 10-foot pit deals 1d6 Bludgeoning plus 2d8 Piercing.",
        "At higher levels: 30 feet, 3d6 plus 3d8 (levels 5–10); 60 feet, 6d6 plus 8d8 (11–16); or 120 feet, 12d6 plus 13d8 (17–20)."
      ] },
      { id: "darts", label: "Poisoned darts", lines: [
        "Deadly at levels 1–4. DC 13 Dexterity save or 1d3 darts hit, each dealing 1d6 Poison.",
        "Each dart's Poison damage becomes 2d6 at levels 5–10, 4d6 at 11–16, or 7d6 at 17–20."
      ] },
      { id: "stone", label: "Rolling stone", lines: [
        "Deadly at levels 11–16, and a nuisance at levels 17–20.",
        "When the stone enters a creature's space, that creature makes a DC 15 Dexterity save or takes 10d10 Bludgeoning and has the Prone condition."
      ] },
      { id: "net", label: "Falling net", lines: [
        "Nuisance at levels 1–4. DC 10 Dexterity save or the Restrained condition. A Huge or larger creature succeeds automatically.",
        "An action and a DC 10 Strength (Athletics) check frees a creature within reach. That DC becomes 12 at levels 5–10, 14 at 11–16, or 16 at 17–20."
      ] }
    ]
  },
  {
    id: "misc",
    title: "Misc",
    items: [
      { id: "typical-dc", label: "Typical DC", parts: [
        { heading: "Very easy 5", lines: [
          "Climb a knotted rope. STR (Athletics).",
          "Notice a campfire in an open field. WIS (Perception).",
          "Recall which nation a famous king ruled. INT (History)."
        ] },
        { heading: "Easy 10", lines: [
          "Tie a knot. DEX (Sleight of Hand).",
          "Calm a tame horse. WIS (Animal Handling).",
          "Follow fresh tracks in mud. WIS (Survival)."
        ] },
        { heading: "Medium 15", lines: [
          "Climb a slippery surface with few holds. STR (Athletics).",
          "Pick an ordinary lock with Thieves' Tools. DEX (Sleight of Hand).",
          "Find obscure information in a book. INT (Investigation)."
        ] },
        { heading: "Hard 20", lines: [
          "Burst a rope. STR (Athletics).",
          "Slip free of manacles. DEX (Sleight of Hand).",
          "Read a practiced liar. WIS (Insight)."
        ] },
        { heading: "Very hard 25", lines: [
          "Burst manacles. STR (Athletics).",
          "Recall lore of a rare magic item. INT (Arcana).",
          "Follow faint tracks on hard stone. WIS (Survival)."
        ] },
        { heading: "Nearly impossible 30", lines: [
          "Stay afloat in a storm-driven sea. STR (Athletics).",
          "Talk a hostile foe into standing down. CHA (Persuasion).",
          "Recall lore almost no one still knows. INT (History)."
        ] }
      ] },
      { id: "exhaustion", label: "Exhaustion", parts: [
        { lines: ["Each gain adds 1 level."] },
        { table: {
          caption: "Cumulative",
          headers: ["Level", "D20 Tests", "Speed"],
          rows: [
            ["1", "-2", "-5 ft"],
            ["2", "-4", "-10 ft"],
            ["3", "-6", "-15 ft"],
            ["4", "-8", "-20 ft"],
            ["5", "-10", "-25 ft"],
            ["6", "You die", "—"]
          ]
        } },
        { heading: "Recovery", lines: [
          "A Long Rest removes 1 level.",
          "At 0, the condition ends."
        ] }
      ] },
      { id: "jumping", label: "Jumping", parts: [
        { heading: "Long jump", lines: [
          "Running: STR score ft.",
          "Standing: half."
        ] },
        { heading: "High jump", lines: [
          "Running: 3 + STR mod ft (min 0).",
          "Standing: half.",
          "Reach: jump + 1.5 × your height."
        ] },
        { heading: "Both", lines: [
          "Running start: 10 ft.",
          "Costs movement.",
          "Difficult terrain landing: DC 10 DEX (Acrobatics) or Prone.",
          "Low obstacle (up to 1/4 of the jump): DC 10 STR (Athletics)."
        ] }
      ] },
      { id: "travel", label: "Travel Pace", parts: [
        { heading: "Fast", lines: [
          "400 feet per minute, 4 miles per hour, or 30 miles per day.",
          "Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth)."
        ] },
        { heading: "Normal", lines: [
          "300 feet per minute, 3 miles per hour, or 24 miles per day.",
          "Disadvantage on Dexterity (Stealth) checks."
        ] },
        { heading: "Slow", lines: [
          "200 feet per minute, 2 miles per hour, or 18 miles per day.",
          "Advantage on Wisdom (Perception or Survival) checks."
        ] }
      ] },
      { id: "mounted", label: "Mounted", parts: [
        { heading: "Mount", lines: [
          "Willing, at least one size larger, suitable anatomy."
        ] },
        { heading: "Mount or dismount", lines: [
          "During your move, within 5 feet.",
          "Costs half your Speed (round down)."
        ] },
        { heading: "Controlled", lines: [
          "Must be trained.",
          "Your Initiative. Moves as you direct.",
          "Only Dash, Disengage, or Dodge.",
          "Can move and act the turn you mount it."
        ] },
        { heading: "Independent", lines: [
          "Keeps its own Initiative and acts as it likes."
        ] },
        { heading: "Falling off", lines: [
          "DC 10 Dexterity saving throw if the mount is moved against its will, or either of you is knocked Prone.",
          "Fail: you land Prone within 5 feet."
        ] }
      ] },
      { id: "underwater", label: "Underwater", parts: [
        { heading: "Melee", lines: [
          "Disadvantage without a Swim Speed, unless the weapon deals Piercing."
        ] },
        { heading: "Ranged", lines: [
          "An attack beyond the weapon's normal range misses.",
          "Within normal range: Disadvantage."
        ] },
        { heading: "Fire", lines: [
          "Resistance to Fire damage."
        ] }
      ] }
    ]
  },
  {
    id: "cover",
    title: "Cover and vision",
    items: [
      { id: "half", label: "Half cover", lines: [
        "+2 bonus to AC and Dexterity saving throws.",
        "A creature or an object covers at least half of the target.",
        "Cover counts only when the attack or effect comes from the opposite side. If several degrees overlap, only the most protective one applies."
      ] },
      { id: "three-quarters", label: "Three-quarters", lines: [
        "+5 bonus to AC and Dexterity saving throws.",
        "An object covers at least three-quarters of the target.",
        "Cover counts only when the attack or effect comes from the opposite side. If several degrees overlap, only the most protective one applies."
      ] },
      { id: "total", label: "Total cover", lines: [
        "The target can't be targeted directly.",
        "An object covers the whole target.",
        "Cover counts only when the attack or effect comes from the opposite side. If several degrees overlap, only the most protective one applies."
      ] },
      { id: "lightly", label: "Lightly obscured", lines: [
        "You have Disadvantage on Wisdom (Perception) checks to see something in that space.",
        "Dim light, patchy fog, or moderate foliage is lightly obscured."
      ] },
      { id: "heavily", label: "Heavily obscured", lines: [
        "You have the Blinded condition while trying to see something in that space.",
        "Darkness, heavy fog, or dense foliage is heavily obscured."
      ] },
      { id: "blindsight", label: "Blindsight", lines: [
        "Within its range you can see without relying on physical sight.",
        "You can see anything that isn't behind Total Cover, even if you have the Blinded condition or are in Darkness.",
        "Within that range you can also see a creature or object that has the Invisible condition."
      ] },
      { id: "darkvision", label: "Darkvision", lines: [
        "Within its range, you see Dim Light as Bright Light and Darkness as Dim Light.",
        "In that Darkness you discern colors only as shades of gray."
      ] },
      { id: "truesight", label: "Truesight", lines: [
        "Within its range you can see in normal and magical Darkness.",
        "You see creatures and objects that have the Invisible condition.",
        "Visual illusions look transparent, and you automatically succeed on saving throws against them.",
        "You discern the true form of a creature or object transformed by magic, and you can see into the Ethereal Plane."
      ] }
    ]
  }
];

function pushTable(entries, prefix, table) {
  entries.push([`${prefix}.caption`, table.caption]);
  for (const [index, header] of table.headers.entries()) entries.push([`${prefix}.headers.${index}`, header]);
  for (const [rowIndex, row] of table.rows.entries()) {
    for (const [column, cell] of row.entries()) entries.push([`${prefix}.rows.${rowIndex}.${column}`, cell]);
  }
}

function pushItem(entries, item) {
  entries.push([`item.${item.id}.label`, item.label]);
  for (const [index, line] of (item.lines ?? []).entries()) entries.push([`item.${item.id}.lines.${index}`, line]);
  if (item.table) pushTable(entries, `item.${item.id}.table`, item.table);
  for (const [index, part] of (item.parts ?? []).entries()) {
    if (part.heading) entries.push([`item.${item.id}.parts.${index}.heading`, part.heading]);
    for (const [line, text] of (part.lines ?? []).entries()) entries.push([`item.${item.id}.parts.${index}.lines.${line}`, text]);
    if (part.table) pushTable(entries, `item.${item.id}.parts.${index}.table`, part.table);
  }
}

export function cheatStringEntries(sections = CHEAT_SECTIONS) {
  const entries = [["tab", "Cheat Sheet"]];
  for (const section of sections) {
    entries.push([`section.${section.id}`, section.title]);
    for (const item of section.items) pushItem(entries, item);
  }
  entries.push(["section.drakkenheim", "Drakkenheim"]);
  for (const item of [...DRAKKENHEIM_CONDITIONS, ...DRAKKENHEIM_ITEMS]) pushItem(entries, item);
  return entries;
}
