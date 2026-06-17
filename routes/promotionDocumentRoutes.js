// routes/promotionDocumentRoutes.js
import express from "express";
import {
  createPromotionDocument,
  getAllPromotionDocuments,
  getPromotionDocumentBySlug,
  getPromotionDocumentById,
  updatePromotionDocument,
  updatePromotionVisibility,
  updatePromotionHotStatus, // Add this
  deletePromotionDocument,
  bulkDeletePromotionDocuments,
  getPromotionByPath,
} from "../controllers/promotionDocumentController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import upload from "../config/multer.js";

const router = express.Router();

// Public routes - NO authentication needed
router.get("/public/:slug", getPromotionDocumentBySlug);
router.get("/public/path/:path", getPromotionByPath);
router.get("/public", getAllPromotionDocuments);

// Admin routes - require authentication
router.post(
  "/",
  protect,
  adminOnly,
  upload.fields([
    { name: "mobileBanner", maxCount: 1 },
    { name: "desktopBanner", maxCount: 1 },
  ]),
  createPromotionDocument,
);

router.get("/", protect, adminOnly, getAllPromotionDocuments);
router.get("/admin/:slug", protect, adminOnly, getPromotionDocumentBySlug);
router.get("/id/:id", protect, adminOnly, getPromotionDocumentById);
router.put(
  "/:id",
  protect,
  adminOnly,
  upload.fields([
    { name: "mobileBanner", maxCount: 1 },
    { name: "desktopBanner", maxCount: 1 },
  ]),
  updatePromotionDocument,
);
router.patch("/visibility/:id", protect, adminOnly, updatePromotionVisibility);
router.patch("/hot/:id", protect, adminOnly, updatePromotionHotStatus); // Add this
router.delete("/:id", protect, adminOnly, deletePromotionDocument);
router.post("/bulk-delete", protect, adminOnly, bulkDeletePromotionDocuments);

export default router;
