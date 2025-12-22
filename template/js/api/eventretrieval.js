// eventretrieval.js
export class EventRetrievalClient {
  constructor({ baseURL = "https://eventretrieval.oj.io.vn/api/v2", fetchImpl } = {}) {
    this.baseURL = baseURL.replace(/\/+$/, "");
    this.fetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
    if (!this.fetch) throw new Error("No fetch implementation found.");
  }
  
  _url(path, params) {
    const u = new URL(this.baseURL + path);
    if (params) Object.entries(params).forEach(([k, v]) => v!=null && u.searchParams.set(k, String(v)));
    return u.toString();
  }
  
  async _request(url, { method = "GET", body } = {}) {
    const res = await this.fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${data?.message || data?.error || res.statusText}`);
      err.status = res.status; err.data = data; throw err;
    }
    return data;
  }

  // ---- Auth & list ----
  async login({ username, password }) {
    return this._request(this._url("/login"), { method: "POST", body: { username, password } });
  }
  async listEvaluations({ session }) {
    return this._request(this._url("/client/evaluation/list", { session }));
  }

  // ---- Submit helpers ----
  /**
   * KIS: body
   * {
   *   "answerSets": [{ "answers": [{ "mediaItemName": "<VIDEO_ID>", "start": <ms>, "end": <ms> }] }]
   * }
   */
  async submitKIS({ evaluationId, session, answers }) {
    // answers: array of { mediaItemName, start, end }
    const url = this._url(`/submit/${encodeURIComponent(evaluationId)}`, { session });
    const answerSets = [{ answers }];
    return this._request(url, { method: "POST", body: { answerSets } });
  }

  /**
   * QA: body
   * {
   *   "answerSets": [{ "answers": [{ "text": "QA-<ANSWER>-<VIDEO_ID>-<TIME(ms)>" }] }]
   * }
   */
  async submitQA({ evaluationId, session, answer }) {
    // answer: { value: string, videoId: string, timeMs: number }
    const { value, videoId, timeMs } = answer;
    const text = `QA-${value}-${videoId}-${timeMs}`;
    const url = this._url(`/submit/${encodeURIComponent(evaluationId)}`, { session });
    return this._request(url, { method: "POST", body: { answerSets: [{ answers: [{ text }] }] } });
  }

  /**
   * TRAKE: body
   * {
   *   "answerSets": [{ "answers": [{ "text": "TR-<VIDEO_ID>-<FRAME_ID1>,<FRAME_ID2>,..." }] }]
   * }
   */
  async submitTRAKE({ evaluationId, session, videoId, frameIds }) {
    // frameIds: number[] | string[]  (IDs theo đề bài)
    const frames = (frameIds || []).join(",");
    const text = `TR-${videoId}-${frames}`;
    const url = this._url(`/submit/${encodeURIComponent(evaluationId)}`, { session });
    return this._request(url, { method: "POST", body: { answerSets: [{ answers: [{ text }] }] } });
  }
}
