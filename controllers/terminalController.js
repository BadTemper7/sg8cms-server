import Outlet from "../models/Outlet.js";
import Terminal from "../models/Terminal.js";
import { broadcast, sendToDeviceBoth } from "../wsServer.js";
import mongoose from "mongoose";

function normalizeMachineId(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ""));
}

async function findTerminalByIdentity(identity) {
  const machineId = normalizeMachineId(identity);
  if (!machineId) return null;

  return Terminal.findOne({
    $or: [{ machineId }, { deviceKey: machineId }],
  });
}

async function getSafeTerminalCodeForOutlet(outletId, preferredCode = "") {
  const code = normalizeCode(preferredCode);

  if (code) {
    const duplicate = await Terminal.findOne({ outletId, code }).lean();
    if (!duplicate) return code;
  }

  return Terminal.getNextTerminalCode(outletId);
}

function buildTerminalUpdateMessage(terminal, extra = {}) {
  return {
    type: "TERMINAL_STATUS_UPDATE",
    data: {
      terminalId: terminal._id.toString(),
      outletId: String(terminal.outletId || ""),
      code: terminal.code,
      machineId: terminal.machineId || "",
      deviceKey: terminal.deviceKey || "",
      isOnline: !!terminal.isOnline,
      isLaunchedGame: !!terminal.isLaunchedGame,
      isGameDisabled: !!terminal.isGameDisabled,
      lastSeenAt: terminal.lastSeenAt || null,
      updatedAt: new Date(),
      ...extra,
    },
  };
}

function sendTerminalUpdate(terminal, message) {
  broadcast(message);
  sendToDeviceBoth(
    {
      deviceCode: terminal.code,
      deviceMongoId: terminal._id.toString(),
      deviceKey: terminal.deviceKey,
      machineId: terminal.machineId,
    },
    message,
  );
}

export const registerLauncherTerminal = async (req, res) => {
  try {
    const {
      machineId: rawMachineId,
      outletId,
      hostname = "",
      launcherVersion = "",
      description = "",
    } = req.body || {};

    const machineId = normalizeMachineId(rawMachineId);

    if (!machineId) {
      return res.status(400).json({ error: "machineId is required" });
    }

    if (!outletId || !isValidObjectId(outletId)) {
      return res.status(400).json({ error: "Valid outletId is required" });
    }

    const outlet = await Outlet.findById(outletId).lean();
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });
    if (outlet.active === false) {
      return res.status(400).json({ error: "Outlet is inactive" });
    }

    const now = new Date();
    let terminal = await findTerminalByIdentity(machineId);
    let created = false;
    let outletChanged = false;

    if (terminal) {
      const oldOutletId = String(terminal.outletId || "");
      const nextOutletId = String(outlet._id);
      outletChanged = oldOutletId !== nextOutletId;

      let nextCode = terminal.code;

      if (outletChanged) {
        const duplicate = await Terminal.findOne({
          outletId: outlet._id,
          code: normalizeCode(terminal.code),
          _id: { $ne: terminal._id },
        }).lean();

        if (duplicate || !terminal.code) {
          nextCode = await Terminal.getNextTerminalCode(outlet._id);
        }
      }

      terminal = await Terminal.findByIdAndUpdate(
        terminal._id,
        {
          outletId: outlet._id,
          code: normalizeCode(nextCode),
          machineId,
          deviceKey: machineId,
          hostname: String(hostname || "").trim(),
          launcherVersion: String(launcherVersion || "").trim(),
          description:
            String(description || "").trim() ||
            terminal.description ||
            `SG8 Launcher ${normalizeCode(nextCode)}`,
          active: true,
          isOnline: true,
          isLaunchedGame: true,
          lastSeenAt: now,
          lastLauncherOpenAt: now,
          pairedAt: terminal.pairedAt || now,
          "lastStatus.updatedAt": now,
        },
        { new: true, runValidators: true },
      ).lean();
    } else {
      const code = await getSafeTerminalCodeForOutlet(outlet._id);

      terminal = await Terminal.create({
        outletId: outlet._id,
        code,
        description:
          String(description || "").trim() ||
          (hostname ? `SG8 Launcher ${hostname}` : `SG8 Launcher ${code}`),
        machineId,
        deviceKey: machineId,
        hostname: String(hostname || "").trim(),
        launcherVersion: String(launcherVersion || "").trim(),
        active: true,
        isOnline: true,
        isLaunchedGame: true,
        lastSeenAt: now,
        pairedAt: now,
        lastLauncherOpenAt: now,
        lastStatus: {
          isPlaying: false,
          videoUrl: "",
          positionSec: 0,
          hasError: false,
          displayId: null,
          mode: "promo",
          updatedAt: now,
        },
      });

      terminal = terminal.toObject();
      created = true;
    }

    const message = buildTerminalUpdateMessage(terminal, {
      reason: created ? "launcher_registered" : "launcher_repaired",
      outletChanged,
    });

    sendTerminalUpdate(terminal, message);

    return res.json({
      ok: true,
      terminal,
      outlet,
      machineId,
      pairing: {
        created,
        outletChanged,
      },
    });
  } catch (e) {
    console.error("[REGISTER_LAUNCHER] Error:", e);

    if (e.code === 11000) {
      return res.status(409).json({
        error: "Duplicate launcher identity or terminal code",
        details: e.keyValue || {},
      });
    }

    return res.status(500).json({ error: e.message });
  }
};

export const createTerminal = async (req, res) => {
  try {
    const { outletId } = req.params;
    const {
      code,
      description,
      active = true,
      isGameDisabled = false,
    } = req.body;

    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const outlet = await Outlet.findById(outletId).lean();
    if (!outlet) return res.status(404).json({ error: "Outlet not found" });

    const normalizedCode = normalizeCode(code);

    const existingTerminal = await Terminal.findOne({
      outletId,
      code: normalizedCode,
    }).lean();

    if (existingTerminal) {
      return res
        .status(409)
        .json({ error: "Terminal code already exists for this outlet" });
    }

    const deviceKey = Terminal.generateDeviceKey(outlet.code, normalizedCode);

    const terminal = await Terminal.create({
      outletId,
      code: normalizedCode,
      description,
      deviceKey,
      active: !!active,
      isGameDisabled: !!isGameDisabled,
    });

    console.log(
      `[CREATE_TERMINAL] Created terminal ${normalizedCode} with device key: ${deviceKey}, isGameDisabled: ${isGameDisabled}`,
    );

    return res.json(terminal);
  } catch (e) {
    if (e.code === 11000) {
      return res
        .status(409)
        .json({ error: "Duplicate terminal code or device key" });
    }
    return res.status(500).json({ error: e.message });
  }
};

export const updateGameLaunched = async (req, res) => {
  try {
    const { isLaunchedGame } = req.body;

    if (typeof isLaunchedGame !== "boolean") {
      return res
        .status(400)
        .json({ error: "isLaunchedGame (boolean) is required" });
    }

    const updateData = {
      isLaunchedGame,
      ...(isLaunchedGame
        ? { isOnline: true, lastSeenAt: new Date(), lastLauncherOpenAt: new Date() }
        : { lastLauncherCloseAt: new Date() }),
    };

    const terminal = await Terminal.findByIdAndUpdate(
      req.params.terminalId,
      updateData,
      { returnDocument: "after", runValidators: true },
    ).lean();

    if (!terminal) return res.status(404).json({ error: "Terminal not found" });

    console.log(
      `[GAME_LAUNCHED] Terminal ${terminal.code} isLaunchedGame=${terminal.isLaunchedGame}`,
    );

    const broadcastMessage = {
      type: "TERMINAL_GAME_LAUNCHED_UPDATE",
      data: {
        terminalId: terminal._id.toString(),
        machineId: terminal.machineId || "",
        deviceKey: terminal.deviceKey || "",
        isLaunchedGame: terminal.isLaunchedGame,
        updatedAt: new Date(),
      },
    };

    sendTerminalUpdate(terminal, broadcastMessage);

    return res.json(terminal);
  } catch (e) {
    console.error(`[GAME_LAUNCHED] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
};

export const getGameLaunchedStatus = async (req, res) => {
  try {
    const { deviceKey } = req.params;
    const identity = normalizeMachineId(deviceKey);

    const terminal = await Terminal.findOne({
      $or: [{ deviceKey: identity }, { machineId: identity }],
    }).lean();

    if (!terminal) {
      return res.status(404).json({ error: "Terminal not found" });
    }

    return res.json({
      isLaunchedGame: terminal.isLaunchedGame || false,
      isGameDisabled: terminal.isGameDisabled || false,
      terminalId: terminal._id,
      machineId: terminal.machineId || "",
      code: terminal.code,
    });
  } catch (e) {
    console.error(`[GET_GAME_LAUNCHED] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
};

export const resetGameLaunched = async (req, res) => {
  try {
    const terminal = await Terminal.findByIdAndUpdate(
      req.params.terminalId,
      { isLaunchedGame: false, lastLauncherCloseAt: new Date() },
      { returnDocument: "after", runValidators: true },
    ).lean();

    if (!terminal) return res.status(404).json({ error: "Terminal not found" });

    console.log(
      `[GAME_RESET] Terminal ${terminal.code} game launched status reset to false`,
    );

    const broadcastMessage = {
      type: "TERMINAL_GAME_LAUNCHED_UPDATE",
      data: {
        terminalId: terminal._id.toString(),
        machineId: terminal.machineId || "",
        deviceKey: terminal.deviceKey || "",
        isLaunchedGame: false,
        updatedAt: new Date(),
      },
    };

    sendTerminalUpdate(terminal, broadcastMessage);

    return res.json(terminal);
  } catch (e) {
    console.error(`[GAME_RESET] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
};

export const createMultipleTerminals = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { outletId } = req.params;
    const {
      count = 1,
      descriptionPrefix = "Display",
      isGameDisabled = false,
    } = req.body;

    if (count < 1 || count > 50) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Count must be between 1 and 50" });
    }

    const outlet = await Outlet.findById(outletId).session(session).lean();
    if (!outlet) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Outlet not found" });
    }

    const terminalCodes = await Terminal.generateTerminalCodes(outletId, count);
    const createdTerminals = [];

    for (let i = 0; i < count; i++) {
      const code = terminalCodes[i];
      const deviceKey = Terminal.generateDeviceKey(outlet.code, code);

      const terminal = new Terminal({
        outletId,
        code,
        description: `${descriptionPrefix} ${code}`,
        deviceKey,
        active: true,
        isOnline: false,
        isGameDisabled: !!isGameDisabled,
      });

      await terminal.save({ session });
      createdTerminals.push(terminal.toObject());
    }

    await session.commitTransaction();

    console.log(
      `[CREATE_MULTIPLE] Created ${count} terminals for outlet ${outlet.code} with isGameDisabled=${isGameDisabled}`,
    );

    return res.json({
      success: true,
      count: createdTerminals.length,
      terminals: createdTerminals,
      codes: terminalCodes,
      message: `${count} terminal(s) created successfully: ${terminalCodes.join(", ")}`,
    });
  } catch (e) {
    await session.abortTransaction();
    console.error("[CREATE_MULTIPLE] Error:", e.message);

    if (e.code === 11000) {
      const field = e.keyPattern ? Object.keys(e.keyPattern)[0] : "unknown";
      return res.status(400).json({
        error: `Duplicate ${field} error`,
        details: `A terminal with this ${field} already exists. Please try again.`,
      });
    }

    return res.status(500).json({ error: e.message });
  } finally {
    session.endSession();
  }
};

export const listTerminals = async (req, res) => {
  try {
    const filter = {};
    if (req.query.outletId) filter.outletId = req.query.outletId;
    if (req.query.active === "true") filter.active = true;
    if (req.query.active === "false") filter.active = false;
    if (req.query.machineId) filter.machineId = normalizeMachineId(req.query.machineId);

    const rows = await Terminal.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const getTerminal = async (req, res) => {
  try {
    const row = await Terminal.findById(req.params.terminalId).lean();
    if (!row) return res.status(404).json({ error: "Terminal not found" });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const updateTerminal = async (req, res) => {
  try {
    const row = await Terminal.findByIdAndUpdate(
      req.params.terminalId,
      req.body,
      {
        new: true,
        runValidators: true,
      },
    ).lean();

    if (!row) return res.status(404).json({ error: "Terminal not found" });
    return res.json(row);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const heartbeatTerminal = async (req, res) => {
  try {
    const { deviceKey } = req.body;
    const identity = normalizeMachineId(deviceKey);

    if (!identity) {
      return res.status(400).json({ error: "deviceKey is required" });
    }

    const terminal = await Terminal.findOne({
      $or: [{ deviceKey: identity }, { machineId: identity }],
    });

    if (!terminal) {
      return res.status(404).json({ error: "Terminal not found" });
    }

    const now = new Date();
    const wasOffline = !terminal.isOnline;
    let shouldLaunchGame = false;

    if (wasOffline && !terminal.isGameDisabled) {
      shouldLaunchGame = true;
    }

    const updateData = {
      lastSeenAt: now,
      isOnline: true,
      "lastStatus.updatedAt": now,
    };

    if (shouldLaunchGame) {
      updateData.isLaunchedGame = true;
      updateData.lastLauncherOpenAt = now;
    }

    const updatedTerminal = await Terminal.findByIdAndUpdate(
      terminal._id,
      updateData,
      { new: true, runValidators: true },
    ).lean();

    console.log(
      `[HEARTBEAT] Terminal ${terminal.code} (${identity}) is online, isGameDisabled=${terminal.isGameDisabled}`,
    );

    if (wasOffline) {
      sendTerminalUpdate(
        updatedTerminal,
        buildTerminalUpdateMessage(updatedTerminal, { reason: "heartbeat_online" }),
      );

      broadcast({
        type: "TERMINAL_HEARTBEAT",
        data: {
          terminalId: terminal._id,
          machineId: terminal.machineId || "",
          deviceKey: identity,
          lastSeenAt: now,
          isOnline: true,
        },
      });

      if (shouldLaunchGame) {
        const gameLaunchMessage = {
          type: "TERMINAL_GAME_LAUNCHED_UPDATE",
          data: {
            terminalId: terminal._id.toString(),
            machineId: terminal.machineId || "",
            deviceKey: identity,
            isLaunchedGame: true,
            updatedAt: now,
            reason: "terminal_online",
          },
        };

        console.log(
          `[HEARTBEAT] Auto-launching game on terminal ${terminal.code} (games not disabled)`,
        );

        sendTerminalUpdate(updatedTerminal, gameLaunchMessage);
      }
    } else {
      sendToDeviceBoth(
        {
          deviceCode: terminal.code,
          deviceMongoId: terminal._id.toString(),
          deviceKey: terminal.deviceKey,
          machineId: terminal.machineId,
        },
        {
          type: "TERMINAL_HEARTBEAT",
          data: {
            terminalId: terminal._id,
            machineId: terminal.machineId || "",
            deviceKey: identity,
            lastSeenAt: now,
            isOnline: true,
          },
        },
      );
    }

    return res.json(updatedTerminal);
  } catch (e) {
    console.error("[HEARTBEAT] Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};

export const removeTerminal = async (req, res) => {
  try {
    const row = await Terminal.findById(req.params.terminalId).lean();
    if (!row) return res.status(404).json({ error: "Terminal not found" });

    const terminalRemovedMessage = {
      type: "TERMINAL_REMOVED",
      data: {
        terminalId: row._id.toString(),
        outletId: String(row.outletId || ""),
        code: row.code || "",
        machineId: row.machineId || "",
        deviceKey: row.deviceKey || "",
        resetIdentity: true,
        updatedAt: new Date(),
      },
    };

    // Notify only the target launcher before deleting the DB record.
    // Do not broadcast this message globally because the launcher must receive it once only.
    // If the launcher is offline, Electron will regenerate the ID on next launch after details returns 404.
    sendToDeviceBoth(
      {
        deviceCode: row.code,
        deviceMongoId: row._id.toString(),
        deviceKey: row.deviceKey,
        machineId: row.machineId,
      },
      terminalRemovedMessage,
    );

    await Terminal.deleteOne({ _id: row._id });

    broadcast({
      type: "ADMIN_TERMINAL_DELETED",
      data: {
        terminalId: row._id.toString(),
        outletId: String(row.outletId || ""),
        machineId: row.machineId || "",
        deviceKey: row.deviceKey || "",
        updatedAt: new Date(),
      },
    });

    return res.json({
      message: "Terminal deleted. Launcher identity will regenerate on that PC.",
      terminalId: row._id.toString(),
      machineId: row.machineId || "",
      deviceKey: row.deviceKey || "",
      resetIdentity: true,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

export const lockTerminal = async (req, res) => {
  try {
    const { isLocked } = req.body;

    if (typeof isLocked !== "boolean") {
      return res.status(400).json({ error: "isLocked (boolean) is required" });
    }

    const terminal = await Terminal.findByIdAndUpdate(
      req.params.terminalId,
      { isLocked },
      { returnDocument: "after", runValidators: true },
    ).lean();

    if (!terminal) return res.status(404).json({ error: "Terminal not found" });

    console.log(
      `[LOCK] Terminal ${terminal.code} isLocked=${terminal.isLocked}`,
    );

    const broadcastMessage = {
      type: "TERMINAL_LOCK_UPDATE",
      data: {
        terminalId: terminal._id.toString(),
        machineId: terminal.machineId || "",
        deviceKey: terminal.deviceKey || "",
        isLocked: terminal.isLocked,
        updatedAt: new Date(),
      },
    };

    sendTerminalUpdate(terminal, broadcastMessage);

    return res.json(terminal);
  } catch (e) {
    console.error(`[LOCK] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
};

export const toggleGameDisabled = async (req, res) => {
  try {
    const { isGameDisabled } = req.body;

    if (typeof isGameDisabled !== "boolean") {
      return res
        .status(400)
        .json({ error: "isGameDisabled (boolean) is required" });
    }

    const currentTerminal = await Terminal.findById(
      req.params.terminalId,
    ).lean();
    if (!currentTerminal)
      return res.status(404).json({ error: "Terminal not found" });

    const updateData = { isGameDisabled };
    let shouldAutoLaunchGame = false;

    if (
      isGameDisabled === false &&
      currentTerminal.isGameDisabled === true &&
      currentTerminal.isOnline === true
    ) {
      updateData.isLaunchedGame = true;
      updateData.lastLauncherOpenAt = new Date();
      shouldAutoLaunchGame = true;
      console.log(
        `[GAME_DISABLED] Games enabled on online terminal, auto-launching game`,
      );
    }

    const terminal = await Terminal.findByIdAndUpdate(
      req.params.terminalId,
      updateData,
      { returnDocument: "after", runValidators: true },
    ).lean();

    console.log(
      `[GAME_DISABLED] Terminal ${terminal.code} isGameDisabled=${terminal.isGameDisabled}, isLaunchedGame=${terminal.isLaunchedGame}, isOnline=${terminal.isOnline}`,
    );

    const gameDisabledMessage = {
      type: "TERMINAL_GAME_DISABLED_UPDATE",
      data: {
        terminalId: terminal._id.toString(),
        machineId: terminal.machineId || "",
        deviceKey: terminal.deviceKey || "",
        isGameDisabled: terminal.isGameDisabled,
        updatedAt: new Date(),
      },
    };

    sendTerminalUpdate(terminal, gameDisabledMessage);

    if (shouldAutoLaunchGame) {
      const gameLaunchedMessage = {
        type: "TERMINAL_GAME_LAUNCHED_UPDATE",
        data: {
          terminalId: terminal._id.toString(),
          machineId: terminal.machineId || "",
          deviceKey: terminal.deviceKey || "",
          isLaunchedGame: true,
          updatedAt: new Date(),
          reason: "games_enabled",
        },
      };

      console.log(
        `[GAME_DISABLED] Broadcasting game launch due to games being re-enabled`,
      );
      sendTerminalUpdate(terminal, gameLaunchedMessage);
    }

    return res.json(terminal);
  } catch (e) {
    console.error(`[GAME_DISABLED] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
};
