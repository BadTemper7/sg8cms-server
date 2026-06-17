// controllers/promotionDocumentController.js
import PromotionDocument from "../models/PromotionDocument.js";
import User from "../models/User.js";
import { broadcast } from "../wsServer.js";
import cloudinary from "../config/cloudinary.js";

// Helper function to upload image to Cloudinary
const uploadToCloudinary = async (file, folder) => {
  if (!file) return null;

  const b64 = Buffer.from(file.buffer).toString("base64");
  const dataURI = `data:${file.mimetype};base64,${b64}`;

  const result = await cloudinary.uploader.upload(dataURI, {
    folder: folder || "promotions/banners",
    transformation: [{ quality: "auto" }, { fetch_format: "auto" }],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

// Helper function to delete image from Cloudinary by publicId
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return null;

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log(`Cloudinary delete result for ${publicId}:`, result);
    return result;
  } catch (error) {
    console.error(`Failed to delete image ${publicId} from Cloudinary:`, error);
    return null;
  }
};

// Helper function to delete all images from a promotion using stored publicIds
const deletePromotionImages = async (promotion) => {
  if (!promotion?.banner) return;

  const deletePromises = [];

  if (promotion.banner.mobile?.publicId) {
    deletePromises.push(deleteFromCloudinary(promotion.banner.mobile.publicId));
  }

  if (promotion.banner.desktop?.publicId) {
    deletePromises.push(
      deleteFromCloudinary(promotion.banner.desktop.publicId),
    );
  }

  if (deletePromises.length > 0) {
    await Promise.all(deletePromises);
  }
};

// Helper function to format slug
const formatSlug = (slug) => {
  if (!slug) return "";
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

// CREATE PROMOTION DOCUMENT
export const createPromotionDocument = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        message: "Authentication required. Please login.",
      });
    }

    // Get form fields
    const {
      id: customId,
      title,
      subtitle,
      content,
      isShow,
      isHot,
      isTncShow,
      startDate,
      endDate,
      slug,
      order,
      altText,
      mobileLabel,
      desktopLabel,
      buttonText,
    } = req.body;

    const mobileBannerFile = req.files?.mobileBanner?.[0];
    const desktopBannerFile = req.files?.desktopBanner?.[0];
    const existingMobileUrl = req.body.mobileBannerUrl;
    const existingDesktopUrl = req.body.desktopBannerUrl;

    // Validate required fields
    if (!title) return res.status(400).json({ message: "Title is required" });
    if (!subtitle)
      return res.status(400).json({ message: "Subtitle is required" });
    if (!content)
      return res.status(400).json({ message: "Content is required" });
    if (!startDate)
      return res.status(400).json({ message: "Start date is required" });
    if (!endDate)
      return res.status(400).json({ message: "End date is required" });
    if (!slug) return res.status(400).json({ message: "Slug is required" });

    if (new Date(startDate) > new Date(endDate)) {
      return res
        .status(400)
        .json({ message: "Start date cannot be after end date" });
    }

    // Format and validate slug
    const formattedSlug = formatSlug(slug);
    if (!formattedSlug) {
      return res.status(400).json({
        message:
          "Invalid slug format. Use only lowercase letters, numbers, and hyphens.",
      });
    }

    // Check if slug already exists
    const existingDoc = await PromotionDocument.findOne({
      slug: formattedSlug,
    });
    if (existingDoc) {
      return res
        .status(400)
        .json({ message: "Slug already exists. Please use a different slug." });
    }

    // Check if custom id already exists (if provided)
    if (customId) {
      const existingId = await PromotionDocument.findOne({ id: customId });
      if (existingId) {
        return res.status(400).json({
          message: "ID already exists. Please use a different ID.",
        });
      }
    }

    // Upload images
    let mobileBannerUrl = null,
      desktopBannerUrl = null;
    let mobilePublicId = null,
      desktopPublicId = null;

    if (mobileBannerFile) {
      const result = await uploadToCloudinary(
        mobileBannerFile,
        "promotions/banners/mobile",
      );
      mobileBannerUrl = result.url;
      mobilePublicId = result.publicId;
    } else if (existingMobileUrl) {
      mobileBannerUrl = existingMobileUrl;
    }

    if (desktopBannerFile) {
      const result = await uploadToCloudinary(
        desktopBannerFile,
        "promotions/banners/desktop",
      );
      desktopBannerUrl = result.url;
      desktopPublicId = result.publicId;
    } else if (existingDesktopUrl) {
      desktopBannerUrl = existingDesktopUrl;
    }

    const promotionData = {
      id: customId ? parseInt(customId) : undefined,
      title: title.trim(),
      subtitle: subtitle.trim(),
      content,
      isShow: isShow === "true" || isShow === true,
      isHot: isHot === "true" || isHot === true,
      isTncShow:
        isTncShow !== undefined
          ? isTncShow === "true" || isTncShow === true
          : true,
      banner: {
        mobile: {
          url:
            mobileBannerUrl || "/images/promotion/mobile/no-banner-mobile.png",
          publicId: mobilePublicId || null,
        },
        desktop: {
          url:
            desktopBannerUrl ||
            "/images/promotion/desktop/no-banner-desktop.png",
          publicId: desktopPublicId || null,
        },
      },
      promoPeriod: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      createdBy: req.user._id,
      lastModifiedBy: req.user._id,
      slug: formattedSlug,
      order: order !== undefined ? parseInt(order) : 0,
      altText: altText || "",
      mobileLabel: mobileLabel || "",
      desktopLabel: desktopLabel || "",
      buttonText: buttonText || "Learn More",
    };

    const promotion = await PromotionDocument.create(promotionData);
    await promotion.populate("createdBy", "username email roles");

    broadcast({
      type: "PROMOTION_DOCUMENT_UPDATED",
      action: "create",
      data: promotion,
    });

    res.status(201).json({
      message: "Promotion document created successfully",
      data: promotion,
    });
  } catch (err) {
    console.error("Create promotion error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET ALL PROMOTION DOCUMENTS (Public)
export const getAllPromotionDocuments = async (req, res) => {
  try {
    const { isShow, isHot, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (isShow !== undefined) {
      query.isShow = isShow === "true";
    }

    if (isHot !== undefined) {
      query.isHot = isHot === "true";
    }

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { subtitle: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { id: !isNaN(parseInt(search)) ? parseInt(search) : null },
      ].filter(Boolean);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [promotions, total] = await Promise.all([
      PromotionDocument.find(query)
        .populate("createdBy", "username email")
        .populate("lastModifiedBy", "username")
        .sort({ isHot: -1, order: 1, isShow: -1, lastModified: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      PromotionDocument.countDocuments(query),
    ]);

    res.json({
      data: promotions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get promotions error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET PROMOTION BY PATH (SLUG) - Public
export const getPromotionByPath = async (req, res) => {
  try {
    const { path } = req.params;
    const cleanPath = path.replace(/^\/+|\/+$/g, "");

    const promotion = await PromotionDocument.findOne({
      slug: cleanPath,
      isShow: true,
    })
      .populate("createdBy", "username email")
      .populate("lastModifiedBy", "username");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion not found" });
    }

    res.json({ data: promotion });
  } catch (err) {
    console.error("Get promotion by path error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET PROMOTION DOCUMENT BY SLUG (Admin)
export const getPromotionDocumentBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const promotion = await PromotionDocument.findOne({ slug })
      .populate("createdBy", "username email")
      .populate("lastModifiedBy", "username");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    const { admin } = req.query;
    if (!admin && !promotion.isShow) {
      return res.status(404).json({ message: "Promotion not available" });
    }

    res.json({ data: promotion });
  } catch (err) {
    console.error("Get promotion error:", err);
    res.status(500).json({ message: err.message });
  }
};

// GET SINGLE PROMOTION DOCUMENT BY ID
export const getPromotionDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const promotion = await PromotionDocument.findById(id)
      .populate("createdBy", "username email")
      .populate("lastModifiedBy", "username");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    res.json({ data: promotion });
  } catch (err) {
    console.error("Get promotion by ID error:", err);
    res.status(500).json({ message: err.message });
  }
};

// UPDATE PROMOTION DOCUMENT
export const updatePromotionDocument = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const existingPromotion = await PromotionDocument.findById(id);
    if (!existingPromotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    const {
      id: customId,
      title,
      subtitle,
      content,
      isShow,
      isHot,
      isTncShow,
      startDate,
      endDate,
      slug,
      mobileBannerUrl: existingMobileUrl,
      desktopBannerUrl: existingDesktopUrl,
      keepMobileBanner,
      keepDesktopBanner,
      order,
      altText,
      mobileLabel,
      desktopLabel,
      buttonText,
    } = req.body;

    const mobileBannerFile = req.files?.mobileBanner?.[0];
    const desktopBannerFile = req.files?.desktopBanner?.[0];

    const updateData = {
      lastModifiedBy: req.user._id,
      lastModified: new Date(),
    };

    // Update custom id if changed
    if (customId !== undefined && customId !== existingPromotion.id) {
      const customIdNum = parseInt(customId);
      if (isNaN(customIdNum)) {
        return res.status(400).json({ message: "ID must be a number" });
      }

      // Check if new id already exists (excluding current document)
      const existingId = await PromotionDocument.findOne({
        id: customIdNum,
        _id: { $ne: id },
      });
      if (existingId) {
        return res.status(400).json({
          message: "ID already exists. Please use a different ID.",
        });
      }
      updateData.id = customIdNum;
    }

    // Update title if changed
    if (title !== undefined && title !== existingPromotion.title) {
      updateData.title = title.trim();
    }

    // Update subtitle if changed
    if (subtitle !== undefined && subtitle !== existingPromotion.subtitle) {
      updateData.subtitle = subtitle.trim();
    }

    // Update content if changed
    if (content !== undefined && content !== existingPromotion.content) {
      updateData.content = content;
    }

    // Update isShow if changed
    if (isShow !== undefined) {
      updateData.isShow = isShow === "true" || isShow === true;
    }
    if (
      mobileLabel !== undefined &&
      mobileLabel !== existingPromotion.mobileLabel
    ) {
      updateData.mobileLabel = mobileLabel;
    }

    if (
      desktopLabel !== undefined &&
      desktopLabel !== existingPromotion.desktopLabel
    ) {
      updateData.desktopLabel = desktopLabel;
    }

    if (
      buttonText !== undefined &&
      buttonText !== existingPromotion.buttonText
    ) {
      updateData.buttonText = buttonText;
    }
    // Update isHot if changed
    if (isHot !== undefined) {
      updateData.isHot = isHot === "true" || isHot === true;
    }

    // Update isTncShow if changed
    if (isTncShow !== undefined) {
      updateData.isTncShow = isTncShow === "true" || isTncShow === true;
    }

    // Update order if changed
    if (order !== undefined && order !== existingPromotion.order) {
      updateData.order = parseInt(order);
    }

    // Update altText if changed
    if (altText !== undefined && altText !== existingPromotion.altText) {
      updateData.altText = altText;
    }

    // Update slug if provided and changed
    if (slug !== undefined && slug !== existingPromotion.slug) {
      const formattedSlug = formatSlug(slug);
      if (!formattedSlug) {
        return res.status(400).json({
          message:
            "Invalid slug format. Use only lowercase letters, numbers, and hyphens.",
        });
      }

      // Check if new slug already exists (excluding current document)
      const existingDoc = await PromotionDocument.findOne({
        slug: formattedSlug,
        _id: { $ne: id },
      });
      if (existingDoc) {
        return res.status(400).json({
          message: "Slug already exists. Please use a different slug.",
        });
      }
      updateData.slug = formattedSlug;
    }

    // Handle promo period
    if (startDate !== undefined || endDate !== undefined) {
      updateData.promoPeriod = {
        startDate: startDate
          ? new Date(startDate)
          : existingPromotion.promoPeriod.startDate,
        endDate: endDate
          ? new Date(endDate)
          : existingPromotion.promoPeriod.endDate,
      };
    }

    // Handle banner updates
    let mobileUrl = existingMobileUrl;
    let mobilePublicId = existingPromotion.banner?.mobile?.publicId;
    let desktopUrl = existingDesktopUrl;
    let desktopPublicId = existingPromotion.banner?.desktop?.publicId;

    // Handle mobile banner
    if (mobileBannerFile) {
      if (existingPromotion.banner?.mobile?.publicId) {
        await deleteFromCloudinary(existingPromotion.banner.mobile.publicId);
      }
      const result = await uploadToCloudinary(
        mobileBannerFile,
        "promotions/banners/mobile",
      );
      mobileUrl = result.url;
      mobilePublicId = result.publicId;
    } else if (keepMobileBanner === "false" || keepMobileBanner === false) {
      if (existingPromotion.banner?.mobile?.publicId) {
        await deleteFromCloudinary(existingPromotion.banner.mobile.publicId);
      }
      mobileUrl = "/images/promotion/mobile/no-banner-mobile.png";
      mobilePublicId = null;
    }

    // Handle desktop banner
    if (desktopBannerFile) {
      if (existingPromotion.banner?.desktop?.publicId) {
        await deleteFromCloudinary(existingPromotion.banner.desktop.publicId);
      }
      const result = await uploadToCloudinary(
        desktopBannerFile,
        "promotions/banners/desktop",
      );
      desktopUrl = result.url;
      desktopPublicId = result.publicId;
    } else if (keepDesktopBanner === "false" || keepDesktopBanner === false) {
      if (existingPromotion.banner?.desktop?.publicId) {
        await deleteFromCloudinary(existingPromotion.banner.desktop.publicId);
      }
      desktopUrl = "/images/promotion/desktop/no-banner-desktop.png";
      desktopPublicId = null;
    }

    if (mobileUrl !== undefined || desktopUrl !== undefined) {
      updateData.banner = {};
      if (mobileUrl !== undefined) {
        updateData.banner.mobile = {
          url: mobileUrl,
          publicId: mobilePublicId || null,
        };
      }
      if (desktopUrl !== undefined) {
        updateData.banner.desktop = {
          url: desktopUrl,
          publicId: desktopPublicId || null,
        };
      }
    }

    const promotion = await PromotionDocument.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true },
    )
      .populate("createdBy", "username email")
      .populate("lastModifiedBy", "username");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    broadcast({
      type: "PROMOTION_DOCUMENT_UPDATED",
      action: "update",
      data: promotion,
    });

    res.json({
      message: "Promotion document updated successfully",
      data: promotion,
    });
  } catch (err) {
    console.error("Update promotion error:", err);
    res.status(500).json({ message: err.message });
  }
};

// UPDATE PROMOTION VISIBILITY
export const updatePromotionVisibility = async (req, res) => {
  try {
    const { id } = req.params;
    const { isShow } = req.body;

    if (typeof isShow !== "boolean") {
      return res.status(400).json({ message: "isShow must be a boolean" });
    }

    const promotion = await PromotionDocument.findByIdAndUpdate(
      id,
      {
        isShow,
        lastModifiedBy: req.user._id,
        lastModified: new Date(),
      },
      { new: true },
    ).populate("createdBy", "username");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    broadcast({
      type: "PROMOTION_DOCUMENT_UPDATED",
      action: "visibility_update",
      data: promotion,
    });

    res.json({
      message: `Promotion ${isShow ? "published" : "hidden"} successfully`,
      data: promotion,
    });
  } catch (err) {
    console.error("Update visibility error:", err);
    res.status(500).json({ message: err.message });
  }
};

// UPDATE PROMOTION HOT STATUS
export const updatePromotionHotStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isHot } = req.body;

    if (typeof isHot !== "boolean") {
      return res.status(400).json({ message: "isHot must be a boolean" });
    }

    const promotion = await PromotionDocument.findByIdAndUpdate(
      id,
      {
        isHot,
        lastModifiedBy: req.user._id,
        lastModified: new Date(),
      },
      { new: true },
    ).populate("createdBy", "username");

    if (!promotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    broadcast({
      type: "PROMOTION_DOCUMENT_UPDATED",
      action: "hot_update",
      data: promotion,
    });

    res.json({
      message: `Promotion ${isHot ? "marked as hot" : "removed from hot"} successfully`,
      data: promotion,
    });
  } catch (err) {
    console.error("Update hot status error:", err);
    res.status(500).json({ message: err.message });
  }
};

// DELETE PROMOTION DOCUMENT
export const deletePromotionDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const promotion = await PromotionDocument.findById(id);

    if (!promotion) {
      return res.status(404).json({ message: "Promotion document not found" });
    }

    await deletePromotionImages(promotion);
    await PromotionDocument.findByIdAndDelete(id);

    broadcast({
      type: "PROMOTION_DOCUMENT_UPDATED",
      action: "delete",
      data: { id: promotion._id, slug: promotion.slug },
    });

    res.json({
      message: "Promotion document and associated images deleted successfully",
      deletedImages: true,
    });
  } catch (err) {
    console.error("Delete promotion error:", err);
    res.status(500).json({ message: err.message });
  }
};

// BULK DELETE PROMOTION DOCUMENTS
export const bulkDeletePromotionDocuments = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No IDs provided" });
    }

    const promotions = await PromotionDocument.find({ _id: { $in: ids } });

    const deleteImagePromises = promotions.map((promo) =>
      deletePromotionImages(promo),
    );
    await Promise.all(deleteImagePromises);

    const result = await PromotionDocument.deleteMany({ _id: { $in: ids } });

    broadcast({
      type: "PROMOTION_DOCUMENT_UPDATED",
      action: "bulk_delete",
      data: { ids, count: result.deletedCount },
    });

    res.json({
      message: `${result.deletedCount} promotion document(s) and associated images deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ message: err.message });
  }
};
