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
    { id: "cap", label: "Huge salary cap ($999M)", prop: "_aQ", value: 999 },
    { id: "fans", label: "Max fan support", prop: "_nO", value: 100 },
    { id: "boss", label: "Owner always happy", prop: "_Nr", value: 100 },
    { id: "rating", label: "Max coach rating", prop: "_F91", value: 20 },
    { id: "stadium", label: "Max stadium level", prop: "_jG", value: 10 },
    { id: "training", label: "Max training facility", prop: "_sG", value: 10 },
    { id: "rehab", label: "Max rehab facility", prop: "_BG", value: 10 },
    { id: "qbnrg", label: "QB never tired", prop: "_ix", value: 100 },
  ],
};

export const modsFor = (name: string): GameMod[] => MODS[name] ?? [];
