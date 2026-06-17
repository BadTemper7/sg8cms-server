import express from "express";
import {
  createOutlet,
  listOutlets,
  getOutlet,
  updateOutlet,
  removeOutlet,
} from "../controllers/outletController.js";

const router = express.Router();

router.get("/", listOutlets);
router.post("/", createOutlet);
router.get("/:outletId", getOutlet);
router.put("/:outletId", updateOutlet);
router.delete("/:outletId", removeOutlet);

export default router;
