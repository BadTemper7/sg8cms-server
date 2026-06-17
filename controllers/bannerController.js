import User from "../models/User.js";
import Banner from "../models/Banner.js";
import { broadcast } from "../wsServer.js";

// CREATE BANNER
export const createBanner = async (req, res) => {
  try {
    const { url, uploadedBy, expiry, status, device, theme } = req.body;
    // Validate required fields
    if (!url || !uploadedBy)
      return res
        .status(400)
        .json({ message: "URL and uploadedBy are required" });

    // Check if the user exists
    const userExists = await User.findById(uploadedBy);
    if (!userExists)
      return res.status(404).json({ message: "Uploader not found" });

    // Build the banner data object
    const bannerData = {
      url,
      uploadedBy,
      status: status || "active", // Default to "active" if no status is provided
      device: device || "desktop", // Default to "desktop" if no deviceMode is provided
      theme: theme || "light", // Default to "light" if no themeMode is provided
    };

    // Add expiry if provided
    if (expiry) bannerData.expiry = expiry;

    // Create the banner in the database
    const banner = await Banner.create(bannerData);
    broadcast({
      type: "BANNER_UPDATED",
      action: "create",
      banner,
    });
    res.status(201).json({
      message: "Banner created successfully",
      banner,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET ALL BANNERS
export const getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.find().populate(
      "uploadedBy",
      "username roles",
    );

    res.json(banners);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, device, theme, expiry, url } = req.body;
    // Prepare the updated banner data
    const updatedBannerData = {
      status: status || "active", // Default to "active" if no status is provided
      device: device || "desktop", // Default to "desktop" if no deviceMode is provided
      theme: theme || "light", // Default to "light" if no themeMode is provided
      expiry,
      url,
    };

    // Find and update the banner
    const updatedBanner = await Banner.findByIdAndUpdate(
      id,
      updatedBannerData,
      {
        new: true,
      },
    );

    if (!updatedBanner) {
      return res.status(404).json({ message: "Banner not found" });
    }
    broadcast({
      type: "BANNER_UPDATED",
      action: "update",
      banner: updatedBanner,
    });

    res.json({
      message: "Banner updated successfully",
      banner: updatedBanner,
    });
  } catch (err) {
    console.error("Update banner error:", err);
    return res.status(500).json({ message: "Failed to update banner" });
  }
};

/**
 * UPDATE BANNER STATUS ONLY (active, hide, expired)
 */
export const updateBannerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const banner = await Banner.findByIdAndUpdate(
      id,
      { status },
      { new: true },
    );

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }

    broadcast({
      type: "BANNER_UPDATED",
      action: "update",
      banner,
    });
    return res.json({
      message: "Banner status updated successfully",
      banner,
    });
  } catch (err) {
    console.error("Update banner status error:", err);
    return res.status(500).json({ message: "Failed to update banner status" });
  }
};
// UPDATE BANNER THEME
export const updateBannerTheme = async (req, res) => {
  try {
    const { id } = req.params;
    const { theme } = req.body;
    if (!theme) {
      return res.status(400).json({ message: "Status is required" });
    }

    const banner = await Banner.findByIdAndUpdate(id, { theme }, { new: true });

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }
    broadcast({
      type: "BANNER_UPDATED",
      action: "update",
      banner,
    });
    return res.json({
      message: "Banner theme updated successfully",
      banner,
    });
  } catch (err) {
    console.error("Update banner theme error:", err);
    return res.status(500).json({ message: "Failed to update banner theme" });
  }
};
// UPDATE BANNER DEVICE MODE
export const updateBannerDevice = async (req, res) => {
  try {
    const { id } = req.params;
    const { device } = req.body;
    if (!device) {
      return res.status(400).json({ message: "Status is required" });
    }

    const banner = await Banner.findByIdAndUpdate(
      id,
      { device },
      { new: true },
    );

    if (!banner) {
      return res.status(404).json({ message: "Banner not found" });
    }
    broadcast({
      type: "BANNER_UPDATED",
      action: "update",
      banner,
    });
    return res.json({
      message: "Banner device updated successfully",
      banner,
    });
  } catch (err) {
    console.error("Update banner device mode error:", err);
    return res
      .status(500)
      .json({ message: "Failed to update banner device mode" });
  }
};

// DELETE BANNER
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) return res.status(404).json({ message: "Banner not found" });
    broadcast({
      type: "BANNER_UPDATED",
      action: "delete",
      id,
    });
    res.json({ message: "Banner deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE MANY BANNERS
export const deleteManyBanners = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const result = await Banner.deleteMany({ _id: { $in: ids } });
    broadcast({
      type: "BANNER_UPDATED",
      action: "delete",
      banner,
    });
    return res.json({
      message: `${result.deletedCount} banners deleted successfully`,
    });
  } catch (err) {
    console.error("Bulk delete banner error:", err);
    return res.status(500).json({ message: "Bulk banner delete failed" });
  }
};
