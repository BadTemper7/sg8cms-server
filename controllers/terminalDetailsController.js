import Terminal from "../models/Terminal.js";
import Outlet from "../models/Outlet.js";
import OutletVideoAssignment from "../models/OutletVideoAssignment.js";
import Video from "../models/Video.js";
import { broadcastToAdmins } from "../wsServer.js";
import mongoose from "mongoose";

const OFFLINE_MS = 15000;

function normalizeIdentity(value) {
  return String(value || "").trim().toUpperCase();
}

function isActiveWindow({ startAt, endAt }, nowMs) {
  const s = startAt ? new Date(startAt).getTime() : null;
  const e = endAt ? new Date(endAt).getTime() : null;
  if (s && nowMs < s) return false;
  if (e && nowMs > e) return false;
  return true;
}

async function findTerminalByIdOrIdentity(value) {
  const text = String(value || "").trim();
  const identity = normalizeIdentity(text);

  if (mongoose.Types.ObjectId.isValid(text)) {
    const byId = await Terminal.findById(text).lean();
    if (byId) return byId;
  }

  if (!identity) return null;

  return Terminal.findOne({
    $or: [{ machineId: identity }, { deviceKey: identity }],
  }).lean();
}

export const getTerminalDetails = async (req, res) => {
  try {
    const { terminalId } = req.params;

    const terminal = await findTerminalByIdOrIdentity(terminalId);
    if (!terminal) return res.status(404).json({ error: "Terminal not found" });

    const outlet = await Outlet.findById(terminal.outletId).lean();
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const nowMs = Date.now();

    const assignments = await OutletVideoAssignment.find({
      outletId: outlet._id,
      active: true,
    })
      .sort({ createdAt: 1 })
      .lean();

    const videoIds = assignments.map((a) => a.videoId);
    const videos = await Video.find({ _id: { $in: videoIds } }).lean();
    const byId = new Map(videos.map((v) => [String(v._id), v]));

    const playlist = assignments
      .map((a) => {
        const v = byId.get(String(a.videoId));
        if (!v) return null;
        if (v.active === false) return null;

        return {
          assignmentId: a._id,
          startAt: a.startAt ?? null,
          endAt: a.endAt ?? null,
          isActiveNow: isActiveWindow(a, nowMs),
          video: {
            id: v._id,
            title: v.title,
            url: v.secureUrl,
            durationSec: v.durationSec,
            format: v.format,
            bytes: v.bytes,
            active: v.active,
          },
        };
      })
      .filter(Boolean);

    const isOnline =
      !!terminal.lastSeenAt &&
      nowMs - new Date(terminal.lastSeenAt).getTime() <= OFFLINE_MS;

    return res.json({
      terminal,
      outlet,
      playlist,
      isOnline,
      offlineThresholdMs: OFFLINE_MS,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const updateTerminalStatus = async (req, res) => {
  try {
    const { terminalId } = req.params;

    const {
      isPlaying = false,
      videoUrl = "",
      positionSec = 0,
      hasError = false,
      displayId = null,
      mode = "promo",
      isOnline = true,
      isLaunchedGame,
    } = req.body || {};

    const terminal = await findTerminalByIdOrIdentity(terminalId);
    if (!terminal) return res.status(404).json({ error: "Terminal not found" });

    const now = new Date();
    const updateData = {
      lastSeenAt: now,
      isOnline: !!isOnline,
      lastStatus: {
        isPlaying: !!isPlaying,
        videoUrl: String(videoUrl || ""),
        positionSec: Number(positionSec || 0),
        hasError: !!hasError,
        displayId: displayId === null ? null : String(displayId),
        mode: String(mode || "promo"),
        updatedAt: now,
      },
    };

    if (typeof isLaunchedGame === "boolean") {
      updateData.isLaunchedGame = isLaunchedGame;
      if (isLaunchedGame) updateData.lastLauncherOpenAt = now;
      if (!isLaunchedGame) updateData.lastLauncherCloseAt = now;
    }

    const updated = await Terminal.findByIdAndUpdate(terminal._id, updateData, {
      new: true,
    }).lean();

    broadcastToAdmins({
      type: "TERMINAL_STATUS",
      terminalId: String(updated._id),
      machineId: updated.machineId || "",
      deviceKey: updated.deviceKey || "",
      lastSeenAt: updated.lastSeenAt,
      isOnline: updated.isOnline,
      isLaunchedGame: updated.isLaunchedGame,
      lastStatus: updated.lastStatus,
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
