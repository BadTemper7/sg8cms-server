import express from "express";
import { getActiveOutletAd } from "../controllers/playbackController.js";

const router = express.Router();

router.get("/outlets/:outletId/active-ad", getActiveOutletAd);

export default router;
