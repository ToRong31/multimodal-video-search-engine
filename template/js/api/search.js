import { ENDPOINTS } from './endpoints.js';
import { httpGet, httpPost } from './client.js';

/**
 * Load real keyframe metadata from file
 */
export async function loadMetadata() {
  try {
    console.log('🔍 Loading real keyframe metadata...');
    const response = await fetch('/data/metadata/path_keyframe.json');
    const metadata = await response.json();

    return metadata;
  } catch (error) {
    console.error('❌ Error loading real keyframe metadata:', error);
    return {};
  }
}

/**
 * Load real scene metadata from file
 */
export async function loadSceneMetadata() {
  try {
    console.log('🔍 Loading real scene metadata...');
    const response = await fetch('/data/metadata/path_scene.json');
    const metadata = await response.json();
    return metadata;
  } catch (error) {
    console.error('❌ Error loading real scene metadata:', error);
    return {};
  }
}

export async function searchApi(payload) {
  // payload giữ schema bạn đã dùng trong callBackend cũ
  return httpPost(ENDPOINTS.search, payload);
}

// Cached loader for index_link watch URLs by folder (e.g., L01_V001)
const indexLinkCache = new Map();

/**
 * Get YouTube watch_url for a given folder from data/index_link/{folder}.json
 * Returns null if not found.
 * Caches results per folder.
 */
export async function getWatchUrlForFolder(folderName) {
  if (!folderName) return null;
  if (indexLinkCache.has(folderName)) {
    return indexLinkCache.get(folderName);
  }
  try {
    // Chỉ fetch 1 lần file Youtube_URL.json
    if (!indexLinkCache.has('_youtube_url_data')) {
      const resp = await fetch('/data/URL/Youtube_URL.json');
      if (!resp.ok) {
        console.warn(`⚠️ Failed to load Youtube_URL.json: ${resp.status}`);
        indexLinkCache.set('_youtube_url_data', []);
      } else {
        const data = await resp.json();
        indexLinkCache.set('_youtube_url_data', Array.isArray(data) ? data : []);
      }
    }
    const urlData = indexLinkCache.get('_youtube_url_data');
    const found = urlData.find(item => item.folder === folderName);
    const url = found?.watch_url || null;
    indexLinkCache.set(folderName, url);
    return url;
  } catch (err) {
    console.error('❌ Error fetching Youtube_URL.json:', err);
    indexLinkCache.set(folderName, null);
    return null;
  }
}

/**
 * Load FPS mapping per video (folder): { "L01_V001": 25.0, ... }
 */
export async function loadFpsMapping() {
  try {
    console.log('🔍 Loading FPS mapping...');
    const response = await fetch('/data/metadata/fps_mapping.json');
    if (!response.ok) return {};
    const mapping = await response.json();
    return mapping || {};
  } catch (err) {
    console.error('❌ Error loading FPS mapping:', err);
    return {};
  }
}