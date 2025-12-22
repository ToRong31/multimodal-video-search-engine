import { store } from '../state/store.js';
import { createPlaceholderImage } from '../utils/placeholderImage.js';

function formatTime(ts) {
  if (ts == null) return '';
  const m = Math.floor(ts / 60);
  const s = (ts % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}
function formatTimeRange(s, e) {
  if (s == null || e == null) return '';
  return `${formatTime(s)} - ${formatTime(e)}`;
}

function resolveKeyframe(id) { return store.metadata?.[String(id)] || null; }
function resolveScene(id)    { return store.sceneMetadata?.[String(id)] || null; }

function getMetadataType(methodKey) {
  return methodKey === 'asr' ? 'scene' : 'keyframe';
}

export function makeThumbItem(hit, methodKey = null) {
  const kind = getMetadataType(methodKey);
  let info, path, ts, timeRange;

  if (kind === 'scene') {
    info = resolveScene(hit.id);
    path = info?.path || '';

    timeRange = formatTimeRange(info?.start_time ?? null, info?.end_time ?? null);
    ts = null;
  } else {
    info = resolveKeyframe(hit.id);
    path = info?.path || '';

    ts = info?.timestamp ?? null;
    timeRange = null;
  }

  const badge = `<div style="position:absolute;left:6px;top:6px;background:#0ea5e9;color:#fff;font-size:11px;padding:2px 6px;border-radius:8px;font-weight:700;">
    ${hit.score !== undefined ? hit.score.toFixed(3) : ''}</div>`;

  const sceneIndicator = (kind === 'scene')
    ? `<div class="scene-indicator">SCENE</div>` : '';

    const meta = `
    <div style="margin-top:6px;font-size:12px;color:#475569;display:flex;gap:8px;flex-wrap:wrap">
      ${timeRange ? `<span>Scene: <b>${timeRange}</b></span>` : ''}
      ${ts != null ? `<span>Time: <b>${formatTime(ts)}</b></span>` : ''}
      <span>ID: <b>${hit.id}</b></span>
      ${kind === 'scene' ? `<span style="color:#f59e0b;font-weight:700;">SCENE</span>` : ''}
    </div>`;
    
  // Sử dụng placeholder image nếu không có path hoặc path không tồn tại
  let imageHtml;
  if (path) {
    // Check if path starts with http or / to determine if it's a real path
    if (path.startsWith('http') || path.startsWith('/')) {
      // Try to use the real image but have placeholder as fallback
      imageHtml = `<img src="${path}" alt="${hit.id}" loading="lazy" onerror="this.onerror=null;this.src='${createPlaceholderImage(hit.id, hit.score)}'">`;
    } else {
      // Use placeholder image if path doesn't seem valid
      imageHtml = `<img src="${createPlaceholderImage(hit.id, hit.score)}" alt="${hit.id}">`;
    }
  } else {
    // Generate a placeholder image with the hit ID and score
    imageHtml = `<img src="${createPlaceholderImage(hit.id, hit.score)}" alt="${hit.id}">`;
  }

  return `
    <div class="thumb">
      <div class="thumb-imgwrap">
        ${badge}${sceneIndicator}
        ${imageHtml}
      </div>
      ${meta}
    </div>`;
}

export function renderPanel(panelEl, title, hits, methodKey = null) {
  const list = Array.isArray(hits) ? hits.slice(0, store.panelTopk) : [];
  panelEl.innerHTML = `
    <div class="panel-head">
      <div class="panel-title">${title}</div>
      <div class="panel-sub">${list.length} items</div>
    </div>
    <div class="thumb-grid">
      ${list.map(hit => makeThumbItem(hit, methodKey)).join('')}
    </div>
  `;
}
