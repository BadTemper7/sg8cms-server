// wsServer.js
import { WebSocketServer } from "ws";
import mongoose from "mongoose";
import Terminal from "./models/Terminal.js";

let wss = null;
let upgradeHandlerAttached = false;

const WS_PATHS = new Set(["/ws", "/ws/"]);
const clientsByDeviceKey = new Map();
const adminClients = new Set();

function toKey(value) {
  return String(value || "").trim();
}

function normalizeIdentity(value) {
  return toKey(value).toUpperCase();
}

function getKeySet(key) {
  const k = toKey(key);
  if (!clientsByDeviceKey.has(k)) clientsByDeviceKey.set(k, new Set());
  return clientsByDeviceKey.get(k);
}

function addClientToKey(key, ws) {
  const k = toKey(key);
  if (!k) return;
  getKeySet(k).add(ws);
}

function removeClientFromKey(key, ws) {
  const k = toKey(key);
  if (!k) return;

  const set = clientsByDeviceKey.get(k);
  if (!set) return;

  set.delete(ws);
  if (set.size === 0) clientsByDeviceKey.delete(k);
}

function anyClientStillConnected(keys) {
  return keys.some((key) => {
    const set = clientsByDeviceKey.get(toKey(key));
    return set && set.size > 0;
  });
}

async function findTerminalForConnection({
  deviceKey,
  machineId,
  deviceMongoId,
  deviceCode,
}) {
  const ors = [];

  const identity = normalizeIdentity(deviceKey || machineId);
  if (identity) {
    ors.push({ deviceKey: identity });
    ors.push({ machineId: identity });
  }

  if (deviceMongoId && mongoose.Types.ObjectId.isValid(deviceMongoId)) {
    ors.push({ _id: deviceMongoId });
  }

  if (deviceCode) {
    ors.push({ code: toKey(deviceCode).toUpperCase() });
  }

  if (!ors.length) return null;

  return Terminal.findOne({ $or: ors });
}

function isOpen(ws) {
  return ws && ws.readyState === 1;
}

export function createWebSocketServer(server) {
  if (!wss) {
    wss = new WebSocketServer({ noServer: true });
  }

  if (!upgradeHandlerAttached) {
    upgradeHandlerAttached = true;

    server.on("upgrade", (req, socket, head) => {
      let pathname = "";

      try {
        const url = new URL(req.url, "http://localhost");
        pathname = url.pathname;
      } catch (error) {
        socket.destroy();
        return;
      }

      if (!WS_PATHS.has(pathname)) {
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    });
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url, "http://localhost");

    const deviceCode = url.searchParams.get("deviceCode");
    const deviceMongoId = url.searchParams.get("deviceMongoId");
    const deviceKey = url.searchParams.get("deviceKey");
    const machineId = url.searchParams.get("machineId");
    const token = url.searchParams.get("token");
    const isAdmin = url.searchParams.get("admin") === "true";

    const connectionKeys = [deviceKey, machineId, deviceMongoId, deviceCode]
      .map(toKey)
      .filter(Boolean);

    console.log("[WS] client connected", {
      path: url.pathname,
      deviceCode,
      deviceMongoId,
      deviceKey,
      machineId,
      isAdmin,
      tokenPresent: !!token,
    });

    if (isAdmin) {
      adminClients.add(ws);
      console.log("[WS] Admin client connected");

      ws.send(
        JSON.stringify({
          type: "WS_ADMIN_CONNECTED",
          message: "Connected as admin",
        }),
      );
    } else if (connectionKeys.length) {
      connectionKeys.forEach((key) => addClientToKey(key, ws));

      findTerminalForConnection({
        deviceKey,
        machineId,
        deviceMongoId,
        deviceCode,
      })
        .then(async (terminal) => {
          if (!terminal) return;

          terminal.isOnline = true;
          terminal.lastSeenAt = new Date();
          await terminal.save();

          broadcastToAdmins({
            type: "TERMINAL_STATUS_UPDATE",
            data: {
              terminalId: terminal._id,
              machineId: terminal.machineId || "",
              deviceKey: terminal.deviceKey || "",
              isOnline: true,
              lastSeenAt: terminal.lastSeenAt,
              updatedAt: new Date(),
            },
          });

          broadcastToAdmins({
            type: "DEVICE_WS",
            action: "connected",
            deviceKey: terminal.deviceKey || deviceKey || machineId || "",
            machineId: terminal.machineId || machineId || "",
          });
        })
        .catch(console.error);
    }

    ws.on("close", async () => {
      adminClients.delete(ws);

      if (!connectionKeys.length) return;

      connectionKeys.forEach((key) => removeClientFromKey(key, ws));

      if (anyClientStillConnected(connectionKeys)) return;

      await findTerminalForConnection({
        deviceKey,
        machineId,
        deviceMongoId,
        deviceCode,
      })
        .then(async (terminal) => {
          if (!terminal) return;

          terminal.isOnline = false;
          terminal.lastSeenAt = new Date();
          await terminal.save();

          broadcastToAdmins({
            type: "TERMINAL_STATUS_UPDATE",
            data: {
              terminalId: terminal._id,
              machineId: terminal.machineId || "",
              deviceKey: terminal.deviceKey || "",
              isOnline: false,
              lastSeenAt: terminal.lastSeenAt,
              updatedAt: new Date(),
            },
          });

          broadcastToAdmins({
            type: "DEVICE_WS",
            action: "disconnected",
            deviceKey: terminal.deviceKey || deviceKey || machineId || "",
            machineId: terminal.machineId || machineId || "",
          });
        })
        .catch(console.error);
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "SUBSCRIBE_TERMINALS" && isAdmin) {
          console.log("[WS] Admin subscribed to terminal updates");
        }
      } catch (error) {
        console.error("[WS] Error parsing message:", error);
      }
    });

    ws.on("error", (error) => {
      console.error("[WS] WebSocket error:", error);
    });

    ws.send(
      JSON.stringify({
        type: "WS_CONNECTED",
        deviceKey:
          deviceKey || machineId || deviceMongoId || deviceCode || null,
        machineId: machineId || "",
        isAdmin,
        message: "Connected to WebSocket",
      }),
    );
  });

  console.log("[WS] Native WebSocket server mounted on /ws");
  return wss;
}

export function broadcast(data) {
  if (!wss) return;

  const json = JSON.stringify(data);

  wss.clients.forEach((client) => {
    if (isOpen(client)) client.send(json);
  });
}

export function broadcastToAdmins(data) {
  if (!wss) return;

  const json = JSON.stringify(data);

  adminClients.forEach((client) => {
    if (isOpen(client)) client.send(json);
  });
}

export function sendToDevice(deviceKey, data) {
  const set = clientsByDeviceKey.get(toKey(deviceKey));
  if (!set) return;

  const json = JSON.stringify(data);
  for (const ws of set) {
    if (isOpen(ws)) ws.send(json);
  }
}

export function sendToDeviceBoth(
  { deviceCode, deviceMongoId, deviceKey, machineId },
  data,
) {
  const keys = [deviceCode, deviceMongoId, deviceKey, machineId]
    .map(toKey)
    .filter(Boolean);

  if (!keys.length) return;

  const recipients = new Set();

  for (const key of keys) {
    const set = clientsByDeviceKey.get(key);
    if (!set) continue;

    for (const ws of set) {
      recipients.add(ws);
    }
  }

  const json = JSON.stringify(data);

  for (const ws of recipients) {
    if (isOpen(ws)) ws.send(json);
  }
}

export function removeAdminClient(ws) {
  adminClients.delete(ws);
}
