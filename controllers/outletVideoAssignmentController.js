import Outlet from "../models/Outlet.js";
import Video from "../models/Video.js";
import OutletVideoAssignment from "../models/OutletVideoAssignment.js";
import { sendToDeviceBoth } from "../wsServer.js";

export const createOutletVideoAssignment = async (req, res) => {
  try {
    const { outletId } = req.params;
    const { videoId, startAt = null, endAt = null, active = true } = req.body;

    if (!videoId) return res.status(400).json({ error: "videoId is required" });

    const outlet = await Outlet.findById(outletId).lean();
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const video = await Video.findById(videoId).lean();
    if (!video) return res.status(404).json({ error: "Video not found" });

    if (startAt && endAt && new Date(startAt) > new Date(endAt)) {
      return res.status(400).json({ error: "startAt must be <= endAt" });
    }

    const assignment = await OutletVideoAssignment.create({
      outletId,
      videoId,
      startAt,
      endAt,
      active: !!active,
    });

    // ✅ push to device(s) watching this outlet
    sendToDeviceBoth(
      { deviceCode: outlet.code, deviceMongoId: outlet._id },
      { type: "OUTLET_AD_CHANGED", outletId: String(outlet._id) },
    );

    return res.json(assignment);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const listOutletVideoAssignments = async (req, res) => {
  try {
    const filter = {};
    if (req.query.outletId) filter.outletId = req.query.outletId;
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;

    const rows = await OutletVideoAssignment.find(filter)
      .populate("videoId")
      .sort({ createdAt: -1 })
      .lean();

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const getOutletVideoAssignment = async (req, res) => {
  try {
    const row = await OutletVideoAssignment.findById(req.params.assignmentId)
      .populate("videoId")
      .lean();

    if (!row) return res.status(404).json({ error: "Assignment not found" });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const updateOutletVideoAssignment = async (req, res) => {
  try {
    const before = await OutletVideoAssignment.findById(
      req.params.assignmentId,
    ).lean();
    if (!before) return res.status(404).json({ error: "Assignment not found" });

    if (req.body.startAt && req.body.endAt) {
      if (new Date(req.body.startAt) > new Date(req.body.endAt)) {
        return res.status(400).json({ error: "startAt must be <= endAt" });
      }
    }

    const row = await OutletVideoAssignment.findByIdAndUpdate(
      req.params.assignmentId,
      req.body,
      { new: true, runValidators: true },
    ).lean();

    const outlet = await Outlet.findById(row.outletId).lean();
    if (outlet) {
      sendToDeviceBoth(
        { deviceCode: outlet.code, deviceMongoId: outlet._id },
        { type: "OUTLET_AD_CHANGED", outletId: String(outlet._id) },
      );
    }

    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const removeOutletVideoAssignment = async (req, res) => {
  try {
    const row = await OutletVideoAssignment.findByIdAndDelete(
      req.params.assignmentId,
    ).lean();
    if (!row) return res.status(404).json({ error: "Assignment not found" });

    const outlet = await Outlet.findById(row.outletId).lean();
    if (outlet) {
      sendToDeviceBoth(
        { deviceCode: outlet.code, deviceMongoId: outlet._id },
        { type: "OUTLET_AD_CHANGED", outletId: String(outlet._id) },
      );
    }

    return res.json({ message: "Deleted" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
