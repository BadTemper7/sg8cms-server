import cron from "node-cron";
import Banner from "../models/Banner.js";
import { broadcast } from "../wsServer.js";

export const expireBannersJob = () => {
  cron.schedule(
    "* * * * *", // every minute
    async () => {
      const now = new Date();

      try {
        const toExpire = await Banner.find(
          { expiry: { $ne: null, $lte: now }, status: { $ne: "expired" } },
          { _id: 1 }
        ).lean();

        if (!toExpire.length) return;

        const ids = toExpire.map((b) => b._id);

        const result = await Banner.updateMany(
          { _id: { $in: ids } },
          { status: "expired" }
        );

        broadcast({
          type: "BANNER_UPDATED",
          action: "expired",
          ids: ids.map(String),
          modifiedCount: result.modifiedCount,
          ts: now.toISOString(),
        });

        console.log(`Expired banners updated: ${result.modifiedCount}`);
      } catch (err) {
        console.error("Error auto-expiring banners:", err);
      }
    },
    { timezone: "Asia/Manila" }
  );
};
