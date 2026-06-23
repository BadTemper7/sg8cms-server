import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Video from "../models/Video.js";
import OutletVideoAssignment from "../models/OutletVideoAssignment.js";
import Outlet from "../models/Outlet.js";
import Terminal from "../models/Terminal.js";
import { broadcast, sendToDevice } from "../wsServer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEO_UPLOAD_DIR = path.resolve(__dirname, "../videos/outlet");

const PUBLIC_SERVER_URL = (
  process.env.PUBLIC_SERVER_URL ||
  process.env.SERVER_URL ||
  "https://ws2.sg8.casino"
).replace(/\/$/, "");

const getOutletVideoUrl = (filename) =>
  `${PUBLIC_SERVER_URL}/videos/outlet/${filename}`;

// Ensure the upload directory exists on startup
if (!fs.existsSync(VIDEO_UPLOAD_DIR)) {
  fs.mkdirSync(VIDEO_UPLOAD_DIR, { recursive: true });
}

export const createVideo = async (req, res) => {
  try {
    const { title, description, active = true } = req.body;

    if (!title) return res.status(400).json({ error: "title is required" });
    if (!req.file) return res.status(400).json({ error: "file is required" });

    // Multer already saved the file directly to VIDEO_UPLOAD_DIR
    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName);

    const video = await Video.create({
      title,
      description,
      filename,
      originalName,
      secureUrl: getOutletVideoUrl(filename),
      bytes: req.file.size,
      durationSec: 0,
      format: ext.replace(".", ""),
      active: active === "true" || active === true,
    });

    return res.json(video);
  } catch (e) {
    // Clean up uploaded file if DB save fails
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    return res.status(500).json({ error: e.message });
  }
};

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

export const getVideo = async (req, res) => {
  try {
    const row = await Video.findById(req.params.videoId).lean();
    if (!row) return res.status(404).json({ error: "Video not found" });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

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

export const removeVideo = async (req, res) => {
  try {
    const row = await Video.findById(req.params.videoId).lean();
    if (!row) return res.status(404).json({ error: "Video not found" });

    // Delete the physical file from disk first
    if (row.filename) {
      const filePath = path.join(VIDEO_UPLOAD_DIR, row.filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`Deleted video file: ${filePath}`);
        }
      } catch (fileErr) {
        console.error("Error deleting local video file:", fileErr.message);
      }
    }

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

export const replaceVideo = async (req, res) => {
  try {
    const row = await Video.findById(req.params.videoId).lean();
    if (!row) return res.status(404).json({ error: "Video not found" });

    if (!req.file) return res.status(400).json({ error: "file is required" });

    // Multer already saved the new file to VIDEO_UPLOAD_DIR
    const filename = req.file.filename;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName);

    // Delete the old file from disk
    if (row.filename) {
      const oldPath = path.join(VIDEO_UPLOAD_DIR, row.filename);
      try {
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
          console.log(`Deleted old video file: ${oldPath}`);
        }
      } catch (fileErr) {
        console.error("Could not delete old video file:", fileErr.message);
      }
    }

    const { title, description, active } = req.body;

    const updated = await Video.findByIdAndUpdate(
      req.params.videoId,
      {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(active !== undefined && {
          active: active === "true" || active === true,
        }),
        filename,
        originalName,
        secureUrl: getOutletVideoUrl(filename),
        bytes: req.file.size,
        format: ext.replace(".", ""),
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
    // Clean up newly uploaded file if update fails
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {}
    }
    return res.status(500).json({ error: e.message });
  }
};

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
