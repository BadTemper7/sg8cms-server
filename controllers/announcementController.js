import Announcement from "../models/Announcement.js";
import { broadcast } from "../wsServer.js";

// Create a new announcement
export const createAnnouncement = async (req, res) => {
  try {
    const { desc, expiry, status = "active" } = req.body;

    // Validate required fields
    if (!desc) {
      return res.status(400).json({ error: "Description is required" });
    }

    const announcement = new Announcement({
      desc,
      expiry: expiry ? new Date(expiry) : undefined,
      status,
    });

    const savedAnnouncement = await announcement.save();
    broadcast({
      type: "ANNOUNCEMENT_UPDATED",
      action: "create",
      announcement,
    });
    res.status(201).json({
      message: "Announcement created successfully",
      announcement: savedAnnouncement,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get all announcements with optional filtering
export const getAnnouncements = async (req, res) => {
  try {
    const { status, activeOnly } = req.query;

    let filter = {};

    if (activeOnly === "true") {
      filter.status = "active";
      filter.$or = [{ expiry: { $gt: new Date() } }, { expiry: null }];
    } else if (status) {
      filter.status = status;
    }

    const announcements = await Announcement.find(filter).sort({
      createdAt: -1,
    });
    res.json(announcements);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// Get a single announcement by ID
export const getAnnouncementById = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    res.json(announcement);
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Announcement not found" });
    }
    res.status(500).json({ error: error.message });
  }
};

// Update an announcement
export const updateAnnouncement = async (req, res) => {
  try {
    const { desc, expiry, status } = req.body;

    const updateData = {};
    if (desc !== undefined) updateData.desc = desc;
    if (expiry !== undefined)
      updateData.expiry = expiry ? new Date(expiry) : null;
    if (status !== undefined) updateData.status = status;

    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    );

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    broadcast({
      type: "ANNOUNCEMENT_UPDATED",
      action: "update",
      announcement,
    });
    res.json({
      message: "Announcement updated successfully",
      announcement,
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Announcement not found" });
    }
    res.status(500).json({ error: error.message });
  }
};

// Delete an announcement
export const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    broadcast({
      type: "ANNOUNCEMENT_UPDATED",
      action: "delete",
      announcement,
    });
    res.json({ message: "Announcement deleted successfully" });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Announcement not found" });
    }
    res.status(500).json({ error: error.message });
  }
};

// Update announcement status (active/hide)
export const updateAnnouncementStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !["active", "hide", "expired"].includes(status)) {
      return res.status(400).json({ error: "Valid status is required" });
    }

    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true },
    );

    if (!announcement) {
      return res.status(404).json({ error: "Announcement not found" });
    }
    broadcast({
      type: "ANNOUNCEMENT_UPDATED",
      action: "update",
      announcement,
    });
    res.json({
      message: "Announcement status updated successfully",
      announcement,
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ error: "Announcement not found" });
    }
    res.status(500).json({ error: error.message });
  }
};

// Get active announcements (for public use)
export const getActiveAnnouncements = async (req, res) => {
  try {
    const currentDate = new Date();

    const activeAnnouncements = await Announcement.find({
      status: "active",
      $or: [
        { expiry: { $exists: false } },
        { expiry: null },
        { expiry: { $gt: currentDate } },
      ],
    }).sort({ createdAt: -1 });

    res.json(activeAnnouncements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getSampleResult = (req, res) => {
  res.send("this is working properly");
};

// DELETE MANY ANNOUNCEMENTS
export const deleteManyAnnouncements = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const result = await Announcement.deleteMany({ _id: { $in: ids } });

    broadcast({
      type: "ANNOUNCEMENT_UPDATED",
      action: "delete",
    });
    return res.json({
      message: `${result.deletedCount} announcements deleted successfully`,
    });
  } catch (err) {
    console.error("Bulk delete announcement error:", err);
    return res.status(500).json({ message: "Bulk announcement delete failed" });
  }
};
