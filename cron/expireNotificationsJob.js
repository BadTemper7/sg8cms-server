import cron from "node-cron";
import Notification from "../models/Notification.js";
import { broadcast } from "../wsServer.js";

export const expireNotificationsJob = () => {
  // Run every minute (real-time enough for expiry)
  cron.schedule(
    "* * * * *",
    async () => {
      const now = new Date();

      try {
        // 1) find which notifications should expire (so we can broadcast ids)
        const toExpire = await Notification.find(
          {
            expiry: { $lte: now },
            status: { $ne: "expired" },
          },
          { _id: 1 }
        ).lean();

        if (!toExpire.length) return;

        const ids = toExpire.map((n) => n._id);

        // 2) expire them
        const result = await Notification.updateMany(
          { _id: { $in: ids } },
          { status: "expired" }
        );

        // 3) broadcast to admin UI for real-time updates
        broadcast({
          type: "NOTIFICATION_UPDATED",
          action: "expired",
          ids: ids.map(String),
          modifiedCount: result.modifiedCount,
          ts: now.toISOString(),
        });

        console.log(
          `Expired notifications updated: ${result.modifiedCount} (checked: ${ids.length})`
        );
      } catch (err) {
        console.error("Error auto-expiring notifications:", err);
      }
    },
    {
      timezone: "Asia/Manila",
    }
  );
};
