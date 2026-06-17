import express from "express";
import {
  createAnnouncement,
  getAnnouncements,
  getAnnouncementById,
  updateAnnouncement,
  deleteAnnouncement,
  updateAnnouncementStatus,
  deleteManyAnnouncements,
} from "../controllers/announcementController.js";

const router = express.Router();

// Admin routes
router.post("/", createAnnouncement);
router.get("/", getAnnouncements);
router.get("/:id", getAnnouncementById);
router.put("/:id", updateAnnouncement);
router.patch("/:id/status", updateAnnouncementStatus);
router.delete("/:id", deleteAnnouncement);
router.post("/bulk-delete", deleteManyAnnouncements);

export default router;
