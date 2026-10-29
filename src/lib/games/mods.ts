/**
 * Game mod menu definitions. Each cheat locks one of the game's internal
 * variables (by its compiled name) to a fixed value. The game shim installs a
 * getter for these names before the game boots, so cheats switch on/off live.
 */
export type GameMod = { id: string; label: string; prop: string; value: number };

const MODS: Record<string, GameMod[]> = {
  // Retro Bowl (GameMaker): `_on` is the coaching-credit balance.
  "Retro Bowl": [{ id: "credits", label: "Infinite coaching credits", prop: "_on", value: 99999 }],
};

export const modsFor = (name: string): GameMod[] => MODS[name] ?? [];
