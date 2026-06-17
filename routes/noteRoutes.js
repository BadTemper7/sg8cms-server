import express from "express";
import { getNotes, createNote } from "../controllers/noteController.js";

const router = express.Router();

router.get("/", getNotes);
router.post("/", createNote);

export default router;
