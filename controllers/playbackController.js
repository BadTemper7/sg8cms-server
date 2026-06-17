import Outlet from "../models/Outlet.js";
import OutletVideoAssignment from "../models/OutletVideoAssignment.js";
import { pickActiveAssignment } from "../services/playbackService.js";

export const getActiveOutletAd = async (req, res) => {
  try {
    const { outletId } = req.params;

    const outlet = await Outlet.findById(outletId).lean();
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const assignments = await OutletVideoAssignment.find({
      outletId,
      active: true,
    })
      .populate("videoId")
      .sort({ createdAt: -1 })
      .lean();

    const active = pickActiveAssignment(assignments, new Date());

    return res.json({
      outletId: String(outlet._id),
      outletCode: outlet.code,
      siteValue: outlet.siteValue,
      activeAd: active
        ? {
            assignmentId: String(active._id),
            startAt: active.startAt,
            endAt: active.endAt,
            video: {
              id: String(active.videoId._id),
              title: active.videoId.title,
              url: active.videoId.secureUrl,
              durationSec: active.videoId.durationSec || 0,
            },
          }
        : null,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
