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
} from "../controllers/videoController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Save directly into the final destination — no temp move needed
const VIDEO_UPLOAD_DIR = path.resolve(__dirname, "../videos/outlet");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, VIDEO_UPLOAD_DIR);
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
    if (file.mimetype !== "video/mp4") {
      return cb(new Error("Only MP4 videos are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

const router = express.Router();

router.get("/", listVideos);
router.get("/:videoId/outlets", getOutletsForVideo);
router.post("/", upload.single("file"), createVideo);
router.get("/:videoId", getVideo);
router.put("/:videoId", updateVideo);
router.put("/:videoId/replace", upload.single("file"), replaceVideo);
router.delete("/:videoId", removeVideo);

export default router;
