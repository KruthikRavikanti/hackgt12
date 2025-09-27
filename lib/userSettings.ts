import { Models } from "@/app/types";
import { z } from "zod";

export const settingsLocalStorageKey = "openArtifacts:settings";

export const settingsSchema = z.object({
  openaiApiKey: z.string(),
  model: z.nativeEnum(Models),
});

export type SettingsSchema = z.infer<typeof settingsSchema>;

const defaultSettings: SettingsSchema = {
  openaiApiKey: "",
  model: Models.gpt4o,
};

export const getSettings = (): SettingsSchema => {
  if (typeof window === "undefined") {
    // Server-side: return default settings
    return defaultSettings;
  }

  const storedSettings = window.localStorage.getItem(settingsLocalStorageKey);

  if (!storedSettings) {
    return defaultSettings;
  }

  try {
    const parsedSettings = JSON.parse(storedSettings);

    // Merge stored settings with default settings to ensure all fields are present
    const mergedSettings: SettingsSchema = {
      ...defaultSettings,
      ...parsedSettings,
    };

    // Ensure the model field is a valid enum value if it exists
    if (
      mergedSettings.model !== null &&
      !Object.values(Models).includes(mergedSettings.model)
    ) {
      console.warn(
        `Invalid model value: ${mergedSettings.model}. Resetting to default.`
      );
      mergedSettings.model = Models.gpt4o;
    }

    // Validate and parse the merged settings
    return settingsSchema.parse(mergedSettings);
  } catch (error) {
    console.error("Error parsing stored settings:", error);
    return defaultSettings;
  }
};

export const updateSettings = (newSettings: SettingsSchema) =>
  window.localStorage.setItem(
    settingsLocalStorageKey,
    JSON.stringify(newSettings)
  );
