import express from "express";
import {
  createBanner,
  getAllBanners,
  updateBanner,
  deleteBanner,
  deleteManyBanners,
  updateBannerStatus,
  updateBannerTheme,
  updateBannerDevice,
} from "../controllers/bannerController.js";
const router = express.Router();

router.post("/", createBanner);
router.get("/", getAllBanners);
router.post("/bulk-delete", deleteManyBanners);
router.put("/:id", updateBanner);
router.delete("/:id", deleteBanner);
router.patch("/status/:id", updateBannerStatus);
router.patch("/theme/:id", updateBannerTheme);
router.patch("/device/:id", updateBannerDevice);

export default router;
