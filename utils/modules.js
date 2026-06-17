// utils/modules.js
export const MODULES = {
  DASHBOARD: "dashboard",
  OUTLETS: "outlets",
  PROMOTIONS: "promotions",
  VIDEO_ADS: "videoAds",
  USERS: "users",
};

export const MODULE_LABELS = {
  [MODULES.DASHBOARD]: "Dashboard",
  [MODULES.OUTLETS]: "Outlets",
  [MODULES.PROMOTIONS]: "Promotions",
  [MODULES.VIDEO_ADS]: "Video Ads",
  [MODULES.USERS]: "Users",
};

export const MODULE_ICONS = {
  [MODULES.DASHBOARD]: "MdDashboard",
  [MODULES.OUTLETS]: "FaStoreAlt",
  [MODULES.PROMOTIONS]: "FaTags",
  [MODULES.VIDEO_ADS]: "MdVideoLibrary",
  [MODULES.USERS]: "FaUserCog",
};

export const getModuleIcon = (moduleName) => {
  const icons = {
    dashboard: <MdDashboard className="w-6 h-6" />,
    outlets: <FaStoreAlt className="w-6 h-6" />,
    promotions: <FaTags className="w-6 h-6" />,
    videoAds: <MdVideoLibrary className="w-6 h-6" />,
    users: <FaUserCog className="w-6 h-6" />,
  };
  return icons[moduleName] || null;
};
