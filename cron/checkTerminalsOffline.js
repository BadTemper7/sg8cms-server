// cron/checkTerminalsOffline.js
import cron from "node-cron";
import Terminal from "../models/Terminal.js";
import { sendToDeviceBoth } from "../wsServer.js"; // Import WebSocket functions

export const checkTerminalsOffline = async () => {
  try {
    console.log("[CRON] Checking for offline terminals...");

    const OFFLINE_THRESHOLD_SECONDS = 15; // 15 seconds threshold
    const thresholdTime = new Date(
      Date.now() - OFFLINE_THRESHOLD_SECONDS * 1000,
    );

    // Find terminals that are marked as online but haven't sent a heartbeat recently
    const offlineTerminals = await Terminal.find({
      isOnline: true,
      lastSeenAt: { $lt: thresholdTime },
    });

    if (offlineTerminals.length > 0) {
      // Update all terminals to offline
      const result = await Terminal.updateMany(
        {
          isOnline: true,
          lastSeenAt: { $lt: thresholdTime },
        },
        {
          $set: { isOnline: false },
        },
      );

      console.log(`[CRON] Marked ${result.modifiedCount} terminals as offline`);

      // Broadcast to WebSocket clients
      offlineTerminals.forEach((terminal) => {
        // Send to all connected clients
        sendToDeviceBoth(
          {
            deviceCode: terminal.code,
            deviceMongoId: terminal._id.toString(),
          },
          {
            type: "TERMINAL_STATUS_UPDATE",
            data: {
              terminalId: terminal._id,
              isOnline: false,
              lastSeenAt: terminal.lastSeenAt,
              updatedAt: new Date(),
            },
          },
        );

        console.log(
          `[CRON] Broadcasted offline status for terminal ${terminal.code}`,
        );
      });
    }

    return { modifiedCount: offlineTerminals.length };
  } catch (error) {
    console.error("[CRON] Error checking offline terminals:", error);
    throw error;
  }
};

// Run every 10 seconds for faster detection
export const startTerminalOfflineCheck = () => {
  console.log("[CRON] Starting terminal offline check scheduler...");

  // Run every 10 seconds
  cron.schedule("*/10 * * * * *", async () => {
    try {
      await checkTerminalsOffline();
    } catch (error) {
      console.error("[CRON] Failed to run terminal offline check:", error);
    }
  });
};
