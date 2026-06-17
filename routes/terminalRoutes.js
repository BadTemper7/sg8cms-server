// routes/terminalRoutes.js
import express from "express";
import {
  registerLauncherTerminal,
  createTerminal,
  listTerminals,
  getTerminal,
  updateTerminal,
  removeTerminal,
  heartbeatTerminal,
  createMultipleTerminals,
  lockTerminal,
  toggleGameDisabled,
  updateGameLaunched,
  getGameLaunchedStatus,
  resetGameLaunched,
} from "../controllers/terminalController.js";

const router = express.Router();

// Electron first-launch pairing endpoint.
// The launcher sends its permanent machineId and the selected outletId.
router.post("/register", registerLauncherTerminal);

router.post("/outlets/:outletId", createTerminal);
router.post("/:outletId/batch", createMultipleTerminals);

router.get("/", listTerminals);

router.post("/heartbeat", heartbeatTerminal);
router.get("/device/:deviceKey/game-status", getGameLaunchedStatus);

router.get("/:terminalId", getTerminal);
router.put("/:terminalId/lock", lockTerminal);
router.put("/:terminalId/game-disabled", toggleGameDisabled);
router.put("/:terminalId/game-launched", updateGameLaunched);
router.put("/:terminalId/game-reset", resetGameLaunched);
router.put("/:terminalId", updateTerminal);
router.delete("/:terminalId", removeTerminal);

export default router;
