import { cloudinary } from "../configs/cloudinary.js";
import { logger } from "./logger.js";

/**
 * Uploads a base64-encoded frame image to Cloudinary object storage.
 * If Cloudinary upload fails or API keys are missing, gracefully falls back to a base64 data URL.
 */
export async function uploadFrameToCloudinary(
  base64Image: string,
  publicId?: string
): Promise<string> {
  const dataUri = base64Image.startsWith("data:")
    ? base64Image
    : `data:image/jpeg;base64,${base64Image}`;

  try {
    const uploadOptions: any = {
      folder: "jenix_screenshots",
      resource_type: "image",
      overwrite: true,
    };
    if (publicId) {
      uploadOptions.public_id = publicId;
    }
    const uploadResult = await cloudinary.uploader.upload(dataUri, uploadOptions);
    return uploadResult?.secure_url || dataUri;
  } catch (error: any) {
    logger.warn(`Cloudinary upload skipped/failed (${error.message}). Using data URL fallback.`);
    return dataUri;
  }
}
