import cron from "node-cron";
import Announcement from "../models/Announcement.js";
import { broadcast } from "../wsServer.js";

export const expireAnnouncementsJob = () => {
  cron.schedule(
    "* * * * *", // every minute
    async () => {
      const now = new Date();

      try {
        const toExpire = await Announcement.find(
          { expiry: { $ne: null, $lte: now }, status: { $ne: "expired" } },
          { _id: 1 }
        ).lean();

        if (!toExpire.length) return;

        const ids = toExpire.map((a) => a._id);

        const result = await Announcement.updateMany(
          { _id: { $in: ids } },
          { status: "expired" }
        );

        broadcast({
          type: "ANNOUNCEMENT_UPDATED",
          action: "expired",
          ids: ids.map(String),
          modifiedCount: result.modifiedCount,
          ts: now.toISOString(),
        });

        console.log(`Expired announcements updated: ${result.modifiedCount}`);
      } catch (err) {
        console.error("Error auto-expiring announcements:", err);
      }
    },
    { timezone: "Asia/Manila" }
  );
};
