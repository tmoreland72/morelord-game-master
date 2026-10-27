// Paraphrased D&D quick reference from the System Reference Document 5.2.1.
// The English strings are the fallback when Foundry's language file has not loaded.
// Keep lang/en.json aligned with cheatStringEntries().
import { DRAKKENHEIM_STRINGS } from "./cheat-sheet-drakkenheim.mjs";

export const CHEAT_ATTRIBUTION = "This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. Rules text is paraphrased.";

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
      { id: "grapple", label: "Grapple", lines: [
        "An Unarmed Strike against a creature within 5 feet. It works only if the target is no more than one size larger than you and you have a hand free. One hand or body part can grapple only one creature.",
        "The target chooses a Strength or Dexterity saving throw. On a failure it has the Grappled condition. The save DC and the escape DC are 8 plus your Strength modifier and Proficiency Bonus.",
        "While Grappled, its Speed is 0 and can't increase, and it has Disadvantage on attack rolls against any target other than you. You can drag or carry it, but each foot of that movement costs 1 extra foot unless it is Tiny or two or more sizes smaller.",
        "It can use its action for a Strength (Athletics) or Dexterity (Acrobatics) check against the escape DC. The grapple also ends if you are Incapacitated, the distance exceeds the grapple's range, or you let go (no action required)."
      ] },
      { id: "shove", label: "Shove", lines: [
        "An Unarmed Strike against a creature within 5 feet. It works only if the target is no more than one size larger than you.",
        "The target chooses a Strength or Dexterity saving throw. The DC is 8 plus your Strength modifier and Proficiency Bonus.",
        "On a failure, you either push it 5 feet away or give it the Prone condition."
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
      { id: "help", label: "Help", lines: [
        "Ability check: choose one of your skill or tool proficiencies and a nearby ally. That ally has Advantage on the next check it makes with that skill or tool before your next turn. The GM decides whether your help is possible.",
        "Attack: distract an enemy within 5 feet. The next attack roll by one ally against that enemy has Advantage. The benefit ends at the start of your next turn.",
        "You can also administer first aid."
      ] },
      { id: "hide", label: "Hide", lines: [
        "Make a DC 15 Dexterity (Stealth) check while you are Heavily Obscured or behind Three-Quarters Cover or Total Cover, and while you are out of any enemy's line of sight. If you can see a creature, you can tell whether it can see you.",
        "On a success you have the Invisible condition while hidden. Your check total is the Wisdom (Perception) DC for a creature to find you.",
        "You stop being hidden if you make a sound louder than a whisper, an enemy finds you, you make an attack roll, or you cast a spell with a Verbal component."
      ] },
      { id: "influence", label: "Influence", lines: [
        "Urge a monster to do something. The GM decides if it is willing, unwilling, or hesitant.",
        "Willing: it complies in a way it prefers. Unwilling: it does not comply. Neither case needs a check.",
        "Hesitant: make an ability check. The DC is 15 or the monster's Intelligence, whichever is higher. A failure means you wait 24 hours, or a time the GM sets, before urging it the same way again.",
        "Deception, Intimidation, Performance, and Persuasion cover talking. Animal Handling covers gently coaxing a Beast or Monstrosity. Friendly gives Advantage. Hostile gives Disadvantage."
      ] },
      { id: "magic", label: "Magic", lines: [
        "Cast a spell with a casting time of an action, or use a feature or magic item that requires a Magic action.",
        "A casting time of 1 minute or longer takes the Magic action on each turn of the casting, and you must concentrate. If Concentration breaks, the spell fails and you don't spend a spell slot."
      ] },
      { id: "ready", label: "Ready", lines: [
        "Choose a perceivable trigger and the action you will take, or a move of up to your Speed. Before your next turn you can use your Reaction after the trigger, or ignore it.",
        "A readied spell must have a casting time of an action. You cast it and spend its resources, then hold it with Concentration until the start of your next turn. If Concentration breaks, the spell dissipates with no effect."
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
        "Use a nonmagical object that requires your action.",
        "During your move or action you can also interact with one object for free, such as drawing a weapon as part of an attack. A second interaction takes the Utilize action."
      ] },
      { id: "opportunity", label: "Opportunity", lines: [
        "When a creature you can see leaves your reach, you can use your Reaction to make one melee attack with a weapon or an Unarmed Strike. The attack happens just before it leaves.",
        "Disengage, teleporting, or being moved without spending your movement, action, Bonus Action, or Reaction does not provoke."
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
        "At the end of a fall, take 1d6 Bludgeoning for every 10 feet fallen, to a maximum of 20d6. You then have the Prone condition unless the fall dealt no damage.",
        "Falling into a liquid lets you use a Reaction for a DC 15 Strength (Athletics) or Dexterity (Acrobatics) check. Success halves the damage."
      ] },
      { id: "suffocating", label: "Suffocating", lines: [
        "You can hold your breath for a number of minutes equal to 1 plus your Constitution modifier (minimum 30 seconds).",
        "When you run out of breath or are choking, you gain 1 Exhaustion level at the end of each of your turns.",
        "When you can breathe again, remove all the Exhaustion levels you gained from suffocating."
      ] },
      { id: "drowning", label: "Drowning", lines: [
        "A creature that cannot breathe while underwater uses the Suffocation hazard.",
        "Hold your breath for minutes equal to 1 plus your Constitution modifier (minimum 30 seconds). After that, gain 1 Exhaustion level at the end of each of your turns until you can breathe again."
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
      { id: "typical-dc", label: "Typical DC", lines: [
        "Very easy 5.",
        "Climb a knotted rope. Strength (Athletics).",
        "Notice a campfire across an open field. Wisdom (Perception).",
        "Recall which nation a famous king ruled. Intelligence (History).",
        "Easy 10.",
        "Tie a knot with rope. Dexterity (Sleight of Hand).",
        "Calm a tame horse. Wisdom (Animal Handling).",
        "Follow fresh tracks through mud. Wisdom (Survival).",
        "Medium 15.",
        "Climb a slippery surface with few handholds. Strength (Athletics).",
        "Pick an ordinary lock with Thieves' Tools. Dexterity (Sleight of Hand).",
        "Find obscure information in a book. Intelligence (Investigation).",
        "Hard 20.",
        "Burst a rope. Strength (Athletics).",
        "Slip free of manacles. Dexterity (Sleight of Hand).",
        "Read a practiced liar's intentions. Wisdom (Insight).",
        "Very hard 25.",
        "Burst a set of manacles. Strength (Athletics).",
        "Recall lore about a rare magic item. Intelligence (Arcana).",
        "Follow faint tracks across hard stone. Wisdom (Survival).",
        "Nearly impossible 30.",
        "Stay afloat in a storm-driven sea. Strength (Athletics).",
        "Convince a hostile foe to stand down. Charisma (Persuasion).",
        "Recall lore that almost no one still knows. Intelligence (History)."
      ] },
      { id: "exhaustion", label: "Exhaustion", lines: [
        "The condition is cumulative. Each time you receive it, you gain 1 Exhaustion level.",
        "On a D20 Test, the roll is reduced by 2 times your Exhaustion level.",
        "Your Speed is reduced by 5 feet times your Exhaustion level.",
        "You die if your Exhaustion level is 6.",
        "Finishing a Long Rest removes 1 Exhaustion level. At 0, the condition ends.",
        "Level 1. D20 Tests are reduced by 2. Speed is reduced by 5 feet.",
        "Level 2. D20 Tests are reduced by 4. Speed is reduced by 10 feet.",
        "Level 3. D20 Tests are reduced by 6. Speed is reduced by 15 feet.",
        "Level 4. D20 Tests are reduced by 8. Speed is reduced by 20 feet.",
        "Level 5. D20 Tests are reduced by 10. Speed is reduced by 25 feet.",
        "Level 6. You die."
      ] },
      { id: "jumping", label: "Jumping", lines: [
        "Long jump.",
        "With at least 10 feet of movement first, you leap up to a number of feet equal to your Strength score. A standing jump covers half that distance.",
        "Each foot you jump costs a foot of movement.",
        "Landing in Difficult Terrain requires a DC 10 Dexterity (Acrobatics) check or you have the Prone condition.",
        "The distance assumes the height does not matter, such as a stream or chasm. To clear a low obstacle no taller than a quarter of the jump, the GM can require a DC 10 Strength (Athletics) check. Otherwise you hit it.",
        "High jump.",
        "With at least 10 feet of movement first, you leap a number of feet equal to 3 plus your Strength modifier, minimum 0. A standing jump covers half that distance.",
        "Each foot you jump costs a foot of movement.",
        "You can reach above you by the height of the jump plus 1½ times your height."
      ] },
      { id: "travel", label: "Travel Pace", lines: [
        "Fast.",
        "Outside combat, the group travels 400 feet per minute, 4 miles per hour, or 30 miles per day.",
        "Disadvantage on Wisdom (Perception or Survival) checks and on Dexterity (Stealth) checks.",
        "Normal.",
        "Outside combat, the group travels 300 feet per minute, 3 miles per hour, or 24 miles per day.",
        "Disadvantage on Dexterity (Stealth) checks.",
        "Slow.",
        "Outside combat, the group travels 200 feet per minute, 2 miles per hour, or 18 miles per day.",
        "Advantage on Wisdom (Perception or Survival) checks."
      ] },
      { id: "mounted", label: "Mounted", lines: [
        "A willing creature at least one size larger than you, with a suitable anatomy, can serve as a mount.",
        "During your move you can mount or dismount a creature within 5 feet. That costs movement equal to half your Speed (round down).",
        "A controlled mount must be trained to accept a rider. Its Initiative matches yours, it moves on your turn as you direct, and it can only Dash, Disengage, or Dodge. It can move and act on the turn you mount it.",
        "An independent mount keeps its own place in Initiative and moves and acts as it likes.",
        "If an effect is about to move your mount against its will, or you or the mount are knocked Prone, succeed on a DC 10 Dexterity saving throw or fall off. You land Prone in an unoccupied space within 5 feet of the mount."
      ] },
      { id: "underwater", label: "Underwater", lines: [
        "A melee attack roll with a weapon has Disadvantage if you lack a Swim Speed, unless the weapon deals Piercing damage.",
        "A ranged attack roll with a weapon automatically misses a target beyond the weapon's normal range, and the roll has Disadvantage against a target within normal range.",
        "Anything underwater has Resistance to Fire damage."
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

export function cheatStringEntries(sections = CHEAT_SECTIONS) {
  const entries = [
    ["tab", "Cheat Sheet"],
    ["attribution", CHEAT_ATTRIBUTION]
  ];
  for (const section of sections) {
    entries.push([`section.${section.id}`, section.title]);
    for (const item of section.items) {
      entries.push([`item.${item.id}.label`, item.label]);
      for (const [index, line] of (item.lines ?? []).entries()) entries.push([`item.${item.id}.lines.${index}`, line]);
      if (item.table) {
        entries.push([`item.${item.id}.table.caption`, item.table.caption]);
        for (const [index, header] of item.table.headers.entries()) entries.push([`item.${item.id}.table.headers.${index}`, header]);
        for (const [rowIndex, row] of item.table.rows.entries()) {
          for (const [column, cell] of row.entries()) entries.push([`item.${item.id}.table.rows.${rowIndex}.${column}`, cell]);
        }
      }
    }
  }
  entries.push(...DRAKKENHEIM_STRINGS);
  return entries;
}
