import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    secureUrl: {
      type: String,
      required: true,
    },
    bytes: {
      type: Number,
      default: 0,
    },
    durationSec: {
      type: Number,
      default: 0,
    },
    format: {
      type: String,
      default: "mp4",
    },
    active: {
      type: Boolean,
      default: true,
    },
    // Cloudinary specific data
    cloudinaryData: {
      publicId: String,
      version: Number,
      resourceType: String,
      url: String,
      secureUrl: String,
      width: Number,
      height: Number,
      duration: Number,
      format: String,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Video", videoSchema);
