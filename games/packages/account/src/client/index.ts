/**
 * The account on the page, for every game: who is signed in, and the button
 * for the top bar. Styles: `@akinozgen/account/client.css`, imported once by
 * each game. The sheet the button opens comes in its own file when it's
 * first wanted, and Firebase only once a player opens the sign-in; neither
 * is exported from here, so neither lands in a game's own bundle.
 */
export { AccountButton, openAccountSheet } from "./AccountButton.tsx";
export { type ApiError, type ApiReply, deleteAccount, endSession, exchangeToken, fetchMe, renameAccount } from "./api.ts";
export { type Account, type AccountState, type AccountStatus, refresh, resetAccountCache, useAccount } from "./store.ts";
export {
  fetchGame,
  fetchRecords,
  importDeviceStats,
  type PuzzleRecords,
  RECORD_CONFLICT,
  RecordConflict,
  recordConflict,
  type Records,
  resetRecordsCache,
  usePuzzleRecords,
} from "./records.ts";
