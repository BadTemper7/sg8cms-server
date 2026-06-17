import cloudinary from "../config/cloudinary.js";

export async function uploadVideoFile(localPath, opts = {}) {
  const folder =
    opts.folder || process.env.CLOUDINARY_FOLDER || "pg-cms/videos"; // safe fallback

  const result = await cloudinary.uploader.upload(localPath, {
    resource_type: "video",
    folder,
    overwrite: true,
  });

  return result;
}

export async function deleteCloudinaryVideo(publicId) {
  const result = await cloudinary.uploader.destroy(publicId, {
    resource_type: "video",
    invalidate: true,
  });
  return result;
}
