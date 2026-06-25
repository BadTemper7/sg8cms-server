import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import {
  createVideo,
  listVideos,
  getVideo,
  updateVideo,
  removeVideo,
  replaceVideo,
  getOutletsForVideo,
  getSignedVideoUrl,
} from "../controllers/videoController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// MULTER CONFIGURATION - Save to temp folder
// ============================================
const TEMP_UPLOAD_DIR = path.resolve(__dirname, "../temp");

// Ensure temp directory exists
import fs from "fs";
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const unique = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Accept video files
    const allowedMimes = [
      "video/mp4",
      "video/mpeg",
      "video/quicktime",
      "video/x-msvideo",
      "video/x-matroska",
      "video/webm",
      "video/ogg",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `File type ${file.mimetype} is not supported. Please upload a video file.`,
        ),
      );
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB
  },
});

const router = express.Router();

// ============================================
// ROUTES
// ============================================

// List all videos
router.get("/", listVideos);

// Get outlets for a video
router.get("/:videoId/outlets", getOutletsForVideo);

// Get signed URL for secure video access
router.get("/:videoId/signed-url", getSignedVideoUrl);

// Create new video (upload to Cloudinary)
router.post("/", upload.single("file"), createVideo);

// Get single video
router.get("/:videoId", getVideo);

// Update video metadata
router.put("/:videoId", updateVideo);

// Replace video file
router.put("/:videoId/replace", upload.single("file"), replaceVideo);

// Delete video
router.delete("/:videoId", removeVideo);

export default router;
