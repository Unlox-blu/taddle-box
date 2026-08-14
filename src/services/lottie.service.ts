import * as FileSystem from "expo-file-system/legacy";

const CACHE_DIR = FileSystem.documentDirectory + "lottie_cache/";

export const S3_APP_ICON_LOTTIE_URL =
  "https://unlox-dev-test.s3.ap-south-1.amazonaws.com/app-assets/taddle_lottie.json";

export const S3_APP_BANNER_LOTTIE_URL = 
  "https://unlox-dev-test.s3.ap-south-1.amazonaws.com/app-assets/taddle_banner_lottie.json";

let memoryCache: Record<string, any> = {};

/**
 * Returns a deep clone of the lottie json synchronously if it is currently cached in memory.
 * Deep cloning prevents lottie-react-native from mutating the shared object and causing loop flickers.
 */
export const getCachedLottieSync = (url: string): any | null => {
  return memoryCache[url] ? JSON.parse(JSON.stringify(memoryCache[url])) : null;
};

/**
 * Downloads a Lottie JSON file from a URL, saves it to the local
 * document directory, and returns the parsed JSON object.
 * On subsequent calls, reads instantly from memory or local file system.
 */
export const getCachedLottie = async (
  url: string,
): Promise<any | null> => {
  if (memoryCache[url]) return JSON.parse(JSON.stringify(memoryCache[url]));

  try {
    const filename = url.split("/").pop() || "animation.json";
    const localUri = CACHE_DIR + filename;

    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }

    const localFile = await FileSystem.getInfoAsync(localUri);
    if (localFile.exists) {
      try {
        const jsonStr = await FileSystem.readAsStringAsync(localUri);
        memoryCache[url] = JSON.parse(jsonStr);
        return JSON.parse(JSON.stringify(memoryCache[url]));
      } catch (parseError) {
        console.warn(`Corrupted cache for ${filename}, deleting and re-downloading...`);
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      }
    }

    // File not found locally (or was corrupted), download it
    console.log(`Downloading Lottie to cache: ${filename}`);
    const downloadRes = await FileSystem.downloadAsync(url, localUri);

    if (downloadRes.status === 200) {
      try {
        const jsonStr = await FileSystem.readAsStringAsync(localUri);
        memoryCache[url] = JSON.parse(jsonStr);
        return JSON.parse(JSON.stringify(memoryCache[url]));
      } catch (parseError) {
        console.warn(`Downloaded file ${filename} is not valid JSON.`);
        await FileSystem.deleteAsync(localUri, { idempotent: true });
        return null;
      }
    } else {
      console.warn(`Failed to download Lottie. Status: ${downloadRes.status}`);
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      return null;
    }
  } catch (e) {
    console.warn("Lottie cache error:", e);
    return null;
  }
};
