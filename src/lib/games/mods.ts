/**
 * Game mod menu definitions. Each cheat locks one of the game's internal
 * variables (by its compiled name) to a fixed value. The game shim installs a
 * getter for these names before the game boots, so cheats switch on/off live.
 */
export type GameMod = { id: string; label: string; prop: string; value: number };

const MODS: Record<string, GameMod[]> = {
  // Retro Bowl (GameMaker): names come from the game's savegame block.
  "Retro Bowl": [
    { id: "credits", label: "Infinite coaching credits", prop: "_on", value: 99999 },
    // Roster space is limited by the salary cap / recruitment credit cap; lifting both = unlimited roster.
    { id: "roster", label: "Unlimited roster size", prop: "_lp", value: 9999 },
    { id: "cap", label: "Huge salary cap ($999M)", prop: "_aQ", value: 999 },
    { id: "fans", label: "Max fan support", prop: "_nO", value: 100 },
    { id: "boss", label: "Owner always happy", prop: "_Nr", value: 100 },
    { id: "rating", label: "Max coach rating", prop: "_F91", value: 20 },
    { id: "stadium", label: "Max stadium level", prop: "_jG", value: 10 },
    { id: "training", label: "Max training facility", prop: "_sG", value: 10 },
    { id: "rehab", label: "Max rehab facility", prop: "_BG", value: 10 },
    { id: "qbnrg", label: "QB never tired", prop: "_ix", value: 100 },
    // Player stats live in GameMaker ds_maps; the shim wraps the map reader (MAP_READER).
    { id: "pall", label: "Max ALL player stats", prop: "map:*", value: 10 },
    { id: "pspeed", label: "Max player speed", prop: "map:speed", value: 10 },
    { id: "pskill", label: "Max player skill", prop: "map:skill", value: 10 },
    { id: "pstr", label: "Max player strength", prop: "map:strength", value: 10 },
    { id: "pstam", label: "Max player stamina", prop: "map:stamina", value: 10 },
  ],
};

/** Compiled ds_map_find_value name + a key only player maps have. */
const MAP_READER: Record<string, { fn: string; probe: string }> = { "Retro Bowl": { fn: "_5n", probe: "max_skill" } };
export const mapReaderFor = (name: string) => MAP_READER[name];

export const modsFor = (name: string): GameMod[] => MODS[name] ?? [];

/** Ready-made AI mod prompts (tap to fill the AI mod box; nothing runs until "Make mod"). */
const PRESETS: Record<string, string[]> = {
  "Retro Bowl": [
    "Max out every player's stats and ratings on my team",
    "Make every player on my team max speed",
    "Make every player max strength, throwing and catching",
    "Make every player young and fully healthy with no injuries",
    "Give me max coaching credits and salary cap",
    "Max out every star rating to 5 stars",
  ],
  "Basketball Stars": [
    "Unlock every character, ball and outfit",
    "Give me max cash and gold",
    "Max out all my player upgrades",
    "Set my level and rank to the max",
  ],
  "Granny": [
    "Unlock every weapon and item",
    "Unlock every difficulty and mode",
    "Mark every escape and ending as done",
  ],
};
/** Cheat menus by game type, matched by name keywords when a game has no exact entry. */
const GENRES: [RegExp, string[]][] = [
  [/basket|soccer|football|bowl|golf|hockey|baseball|tennis|sport|ball/i, ["Unlock every player, team and item", "Max out all my player stats", "Give me max coins and cash"]],
  [/granny|horror|scary|fnaf|freddy|baldi|slender/i, ["Unlock every weapon, item and tool", "Unlock every night, level and mode", "Mark every ending as done"]],
  [/shoot|gun|war|1v1|sniper|zombie|bow|strike|combat|fight/i, ["Unlock every weapon and skin", "Give me max coins, gems and ammo", "Set my level to the max"]],
  [/race|car|drift|moto|drive|bike|truck/i, ["Unlock every car and track", "Give me max money", "Max out all car upgrades"]],
  [/run|jump|dash|geometry|subway|temple|level|world/i, ["Unlock every level and world", "Unlock every character and skin", "Give me max coins"]],
  [/tycoon|idle|clicker|cookie|farm|simulator/i, ["Give me max money and gems", "Max out every upgrade", "Unlock everything"]],
];
const GENERIC = ["Unlock everything", "Give me max coins and currency", "Set my level to the max"];
export const presetsFor = (name: string): string[] => {
  const exact = Object.entries(PRESETS).find(([k]) => name.toLowerCase().includes(k.toLowerCase()));
  if (exact) return exact[1];
  return GENRES.find(([r]) => r.test(name))?.[1] ?? GENERIC;
};
