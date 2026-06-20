export { GAME_1830 } from "./1830.js";
export { STANDARD_TILES } from "./tiles.js";
export const GAMES = ["1830"] as const;
export type GameId = (typeof GAMES)[number];
