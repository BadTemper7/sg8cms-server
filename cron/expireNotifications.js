import cron from "node-cron";
import Notification from "../models/Notification.js";
import { broadcast } from "../wsServer.js";

export const expireNotificationsJob = () => {
  cron.schedule("0 0 * * *", async () => {
    const today = new Date();

    try {
      const result = await Notification.updateMany(
        {
          expiry: { $lte: today },
          status: { $ne: "expired" }, // only update active or hide
        },
        { status: "expired" }
      );
      broadcast({
        type: "NOTIFICATION_UPDATED",
        action: "expired",
      });
      console.log(`Expired notifications updated: ${result.modifiedCount}`);
    } catch (err) {
      console.error("Error auto-expiring notifications:", err);
    }
  });
};
