import mongoose from "mongoose";

const videoSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    // Local file info
    filename: { type: String, required: true, trim: true }, // unique name on disk
    originalName: { type: String, trim: true, default: "" }, // original upload name

    // Relative URL served by Express static middleware
    secureUrl: { type: String, required: true, trim: true },

    format: { type: String, trim: true, default: "" },
    bytes: { type: Number, default: 0 },
    durationSec: { type: Number, default: 0 },

    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("Video", videoSchema);
