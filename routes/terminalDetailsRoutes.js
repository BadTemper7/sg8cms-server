import express from "express";
import {
  getTerminalDetails,
  updateTerminalStatus,
} from "../controllers/terminalDetailsController.js";

const router = express.Router();

// GET terminal details + outlet siteValue + active video + (optional) assignments
router.get("/:terminalId/details", getTerminalDetails);
router.post("/:terminalId/status", updateTerminalStatus);
export default router;
