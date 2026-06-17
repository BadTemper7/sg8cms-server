// utils/initializeSettings.js
import Setting from "../models/Settings.js";

export const initializeSettings = async () => {
  try {
    const settings = [
      {
        settingType: "system",
        key: "turnover_value",
        value: 0,
        label: "Turnover Value",
        description: "Current turnover value for testing purposes",
        dataType: "number",
        isEditable: true,
        category: "general",
        order: 1,
      },
      {
        settingType: "system",
        key: "promo_start_date",
        value: "2026-02-02",
        label: "Promo Start Date",
        description: "Start date of the promotion",
        dataType: "string",
        isEditable: true,
        category: "general",
        order: 2,
      },
      {
        settingType: "system",
        key: "promo_end_date",
        value: "2026-03-29",
        label: "Promo End Date",
        description: "End date of the promotion",
        dataType: "string",
        isEditable: true,
        category: "general",
        order: 3,
      },
    ];

    for (const setting of settings) {
      await Setting.findOneAndUpdate({ key: setting.key }, setting, {
        upsert: true,
        new: true,
      });
    }

    console.log("Settings initialized successfully");
  } catch (error) {
    console.error("Error initializing settings:", error);
  }
};
