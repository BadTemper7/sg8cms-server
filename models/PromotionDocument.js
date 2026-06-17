// models/PromotionDocument.js
import mongoose from "mongoose";

const bannerImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      default: function () {
        return this.device === "mobile"
          ? "/images/promotion/mobile/no-banner-mobile.png"
          : "/images/promotion/desktop/no-banner-desktop.png";
      },
    },
    publicId: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const promoPeriodSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
    },
  },
  { _id: false },
);

const promotionDocumentSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      unique: true,
      sparse: true,
      description: "Custom numeric identifier for the promotion",
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      index: true,
    },
    subtitle: {
      type: String,
      required: [true, "Subtitle is required"],
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    isShow: {
      type: Boolean,
      default: false,
    },
    isHot: {
      type: Boolean,
      default: false,
      index: true,
      description: "Mark promotion as hot/featured for highlighting",
    },
    isTncShow: {
      type: Boolean,
      default: true,
    },
    banner: {
      mobile: bannerImageSchema,
      desktop: bannerImageSchema,
    },
    promoPeriod: promoPeriodSchema,
    slug: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
      index: true,
      description:
        "Priority order for displaying promotions (lower number = higher priority)",
    },
    altText: {
      type: String,
      default: "",
      trim: true,
      description: "Alternative text for banner images (SEO)",
    },
    // New fields for featured card display
    mobileLabel: {
      type: String,
      default: "",
      trim: true,
      description: "Short label/text to display on mobile featured cards",
    },
    desktopLabel: {
      type: String,
      default: "",
      trim: true,
      description: "Short label/text to display on desktop featured cards",
    },
    buttonText: {
      type: String,
      default: "Learn More",
      trim: true,
      description: "Text to display on the call-to-action button",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastModified: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  },
);

// Index for sorting by order priority and hot status
promotionDocumentSchema.index({
  isHot: -1,
  order: 1,
  isShow: -1,
  lastModified: -1,
});

// Index for id field
promotionDocumentSchema.index({ id: 1 });

const PromotionDocument = mongoose.model(
  "PromotionDocument",
  promotionDocumentSchema,
);
export default PromotionDocument;
