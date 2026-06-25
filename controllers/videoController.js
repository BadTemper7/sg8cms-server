import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Video from "../models/Video.js";
import OutletVideoAssignment from "../models/OutletVideoAssignment.js";
import Outlet from "../models/Outlet.js";
import Terminal from "../models/Terminal.js";
import { broadcast, sendToDevice } from "../wsServer.js";
import cloudinary from "../config/cloudinary.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CLOUDINARY CONFIGURATION
// ============================================
const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "pg-cms/videos";
const TEMP_UPLOAD_DIR = path.resolve(__dirname, "../temp");

// Ensure temp directory exists for multer
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

// ============================================
// HELPER FUNCTIONS
// ============================================
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  try {
    // Extract public_id from Cloudinary URL
    // Example: https://res.cloudinary.com/dhfy8flur/video/upload/v123/pg-cms/videos/filename.mp4
    const parts = url.split("/");
    const filename = parts[parts.length - 1];
    const publicId = filename.split(".")[0];
    return `${CLOUDINARY_FOLDER}/${publicId}`;
  } catch (error) {
    console.error("Error extracting public_id:", error);
    return null;
  }
};

// ============================================
// CREATE VIDEO - Upload to Cloudinary
// ============================================
export const createVideo = async (req, res) => {
  try {
    const { title, description, active = true } = req.body;

    if (!title) {
      return res.status(400).json({ error: "title is required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "file is required" });
    }

    // Upload to Cloudinary
    console.log(`📤 Uploading video to Cloudinary: ${req.file.originalname}`);

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: CLOUDINARY_FOLDER,
      public_id: `video-${Date.now()}`,
      eager: [{ format: "mp4", quality: "auto" }],
      eager_async: true,
    });

    console.log(`✅ Video uploaded to Cloudinary: ${result.public_id}`);

    // Clean up temp file
    try {
      fs.unlinkSync(req.file.path);
      console.log(`🗑️ Deleted temp file: ${req.file.path}`);
    } catch (err) {
      console.warn(`⚠️ Could not delete temp file: ${err.message}`);
    }

    // Create video record in database
    const video = await Video.create({
      title,
      description,
      filename: result.public_id,
      originalName: req.file.originalname,
      secureUrl: result.secure_url,
      bytes: result.bytes,
      durationSec: result.duration || 0,
      format: result.format || "mp4",
      active: active === "true" || active === true,
      cloudinaryData: {
        publicId: result.public_id,
        version: result.version,
        resourceType: result.resource_type,
        url: result.url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        duration: result.duration,
        format: result.format,
      },
    });

    return res.json(video);
  } catch (e) {
    console.error("❌ Error uploading video to Cloudinary:", e);

    // Clean up temp file if exists
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {}
    }

    return res.status(500).json({
      error: e.message,
      details: e.error?.message || "Cloudinary upload failed",
    });
  }
};

// ============================================
// LIST VIDEOS
// ============================================
export const listVideos = async (req, res) => {
  try {
    const filter = {};
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;

    const rows = await Video.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// ============================================
// GET SINGLE VIDEO
// ============================================
export const getVideo = async (req, res) => {
  try {
    const row = await Video.findById(req.params.videoId).lean();
    if (!row) return res.status(404).json({ error: "Video not found" });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// ============================================
// UPDATE VIDEO
// ============================================
export const updateVideo = async (req, res) => {
  try {
    const row = await Video.findByIdAndUpdate(req.params.videoId, req.body, {
      new: true,
      runValidators: true,
    }).lean();

    if (!row) return res.status(404).json({ error: "Video not found" });

    const changedKeys = Object.keys(req.body || {});
    const shouldRefreshPlayers = [
      "active",
      "secureUrl",
      "durationSec",
      "title",
      "filename",
      "originalName",
    ].some((k) => changedKeys.includes(k));

    if (shouldRefreshPlayers) {
      const assignments = await OutletVideoAssignment.find({
        videoId: row._id,
        active: true,
      })
        .select("outletId")
        .lean();

      const outletIds = [
        ...new Set(assignments.map((a) => String(a.outletId))),
      ];

      if (outletIds.length) {
        const terminals = await Terminal.find({
          outletId: { $in: outletIds },
          active: true,
        })
          .select("_id code deviceKey outletId")
          .lean();

        for (const t of terminals) {
          const payload = {
            type: "OUTLET_PLAYLIST_CHANGED",
            reason: "VIDEO_UPDATED",
            outletId: String(t.outletId),
            videoId: String(row._id),
            changedKeys,
            active: row.active,
          };
          sendToDevice(String(t._id), payload);
          if (t.code) sendToDevice(t.code, payload);
          if (t.deviceKey) sendToDevice(t.deviceKey, payload);
        }
      }

      broadcast({
        type: "ADMIN_VIDEO_UPDATED",
        videoId: String(row._id),
        active: row.active,
        changedKeys,
        outletIds,
      });
    }

    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// ============================================
// DELETE VIDEO - Remove from Cloudinary and Database
// ============================================
export const removeVideo = async (req, res) => {
  try {
    const row = await Video.findById(req.params.videoId).lean();
    if (!row) return res.status(404).json({ error: "Video not found" });

    // Delete from Cloudinary
    if (row.cloudinaryData?.publicId) {
      try {
        console.log(
          `🗑️ Deleting from Cloudinary: ${row.cloudinaryData.publicId}`,
        );
        const result = await cloudinary.uploader.destroy(
          row.cloudinaryData.publicId,
          { resource_type: "video" },
        );
        console.log(`✅ Cloudinary delete result:`, result);
      } catch (cloudErr) {
        console.error("❌ Error deleting from Cloudinary:", cloudErr.message);
        // Continue with database deletion even if Cloudinary fails
      }
    }

    // Delete from database
    await Video.deleteOne({ _id: row._id });
    await OutletVideoAssignment.deleteMany({ videoId: row._id });

    broadcast({
      type: "VIDEO_DELETED",
      videoId: String(row._id),
    });

    return res.json({
      message: "Video and its assignments have been deleted",
      videoId: String(row._id),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// ============================================
// REPLACE VIDEO - Upload new version to Cloudinary
// ============================================
export const replaceVideo = async (req, res) => {
  try {
    const row = await Video.findById(req.params.videoId).lean();
    if (!row) return res.status(404).json({ error: "Video not found" });

    if (!req.file) return res.status(400).json({ error: "file is required" });

    // Delete old file from Cloudinary
    if (row.cloudinaryData?.publicId) {
      try {
        console.log(
          `🗑️ Deleting old video from Cloudinary: ${row.cloudinaryData.publicId}`,
        );
        await cloudinary.uploader.destroy(row.cloudinaryData.publicId, {
          resource_type: "video",
        });
      } catch (cloudErr) {
        console.error(
          "⚠️ Could not delete old video from Cloudinary:",
          cloudErr.message,
        );
        // Continue with upload
      }
    }

    // Upload new video to Cloudinary
    console.log(
      `📤 Uploading replacement video to Cloudinary: ${req.file.originalname}`,
    );

    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: "video",
      folder: CLOUDINARY_FOLDER,
      public_id: `video-${Date.now()}`,
      eager: [{ format: "mp4", quality: "auto" }],
      eager_async: true,
    });

    console.log(`✅ Replacement video uploaded: ${result.public_id}`);

    // Clean up temp file
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {}

    const { title, description, active } = req.body;

    const updated = await Video.findByIdAndUpdate(
      req.params.videoId,
      {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(active !== undefined && {
          active: active === "true" || active === true,
        }),
        filename: result.public_id,
        originalName: req.file.originalname,
        secureUrl: result.secure_url,
        bytes: result.bytes,
        format: result.format || "mp4",
        durationSec: result.duration || 0,
        cloudinaryData: {
          publicId: result.public_id,
          version: result.version,
          resourceType: result.resource_type,
          url: result.url,
          secureUrl: result.secure_url,
          width: result.width,
          height: result.height,
          duration: result.duration,
          format: result.format,
        },
      },
      { new: true, runValidators: true },
    ).lean();

    // Notify connected terminals
    const assignments = await OutletVideoAssignment.find({
      videoId: updated._id,
      active: true,
    })
      .select("outletId")
      .lean();

    const outletIds = [...new Set(assignments.map((a) => String(a.outletId)))];

    if (outletIds.length) {
      const terminals = await Terminal.find({
        outletId: { $in: outletIds },
        active: true,
      })
        .select("_id code deviceKey outletId")
        .lean();

      for (const t of terminals) {
        const payload = {
          type: "OUTLET_PLAYLIST_CHANGED",
          reason: "VIDEO_REPLACED",
          outletId: String(t.outletId),
          videoId: String(updated._id),
        };
        sendToDevice(String(t._id), payload);
        if (t.code) sendToDevice(t.code, payload);
        if (t.deviceKey) sendToDevice(t.deviceKey, payload);
      }
    }

    broadcast({
      type: "ADMIN_VIDEO_UPDATED",
      videoId: String(updated._id),
      reason: "VIDEO_REPLACED",
      outletIds,
    });

    return res.json(updated);
  } catch (e) {
    // Clean up temp file if upload fails
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {}
    }
    return res.status(500).json({ error: e.message });
  }
};

// ============================================
// GET OUTLETS FOR VIDEO
// ============================================
export const getOutletsForVideo = async (req, res) => {
  try {
    const { videoId } = req.params;

    const video = await Video.findById(videoId).lean();
    if (!video) return res.status(404).json({ error: "Video not found" });

    const assignments = await OutletVideoAssignment.find({ videoId })
      .sort({ createdAt: -1 })
      .lean();

    if (!assignments || assignments.length === 0) {
      return res.json({ video, totalAssignedOutlets: 0, assignments: [] });
    }

    const outletIds = [...new Set(assignments.map((a) => String(a.outletId)))];
    const outlets = await Outlet.find({ _id: { $in: outletIds } }).lean();
    const outletById = new Map(outlets.map((o) => [String(o._id), o]));

    const detailed = assignments
      .map((a) => {
        const outlet = outletById.get(String(a.outletId));
        if (!outlet) return null;

        return {
          outletAssigned: {
            assignmentId: String(a._id),
            active: a.active !== false,
            startAt: a.startAt ?? null,
            endAt: a.endAt ?? null,
            createdAt: a.createdAt ?? null,
            updatedAt: a.updatedAt ?? null,
          },
          outlet: {
            _id: String(outlet._id),
            code: outlet.code,
            name: outlet.name,
            location: outlet.location,
            siteValue: outlet.siteValue,
            active: outlet.active,
            createdAt: outlet.createdAt ?? null,
            updatedAt: outlet.updatedAt ?? null,
          },
        };
      })
      .filter(Boolean);

    return res.json({
      video: {
        _id: String(video._id),
        title: video.title,
        description: video.description,
        active: video.active,
        filename: video.filename,
        originalName: video.originalName,
        secureUrl: video.secureUrl,
        bytes: video.bytes,
        durationSec: video.durationSec,
        format: video.format,
        createdAt: video.createdAt ?? null,
        updatedAt: video.updatedAt ?? null,
      },
      totalAssignedOutlets: detailed.length,
      assignments: detailed,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

// ============================================
// GET CLOUDINARY SIGNED URL (For secure access)
// ============================================
export const getSignedVideoUrl = async (req, res) => {
  try {
    const { videoId } = req.params;
    const video = await Video.findById(videoId).lean();

    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // Generate a signed URL that expires in 1 hour
    const signedUrl = cloudinary.url(video.cloudinaryData.publicId, {
      resource_type: "video",
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    });

    return res.json({
      signedUrl,
      expiresIn: 3600,
      publicId: video.cloudinaryData.publicId,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
