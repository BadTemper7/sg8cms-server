// routes/uploadRoutes.js
import express from "express";
import multer from "multer";
import cloudinary from "../config/cloudinary.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"), false);
    }
  },
});

// Upload single image to Cloudinary
router.post(
  "/image",
  protect,
  adminOnly,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided" });
      }

      // Convert buffer to base64
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: "promotions/banners",
        transformation: [{ quality: "auto" }, { fetch_format: "auto" }],
      });

      res.json({
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ message: "Failed to upload image" });
    }
  },
);

export default router;
