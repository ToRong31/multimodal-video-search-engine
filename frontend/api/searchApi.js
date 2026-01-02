/**
 * Search API - Handles all search-related API calls
 */

import { apiClient } from './client.js';

export const searchApi = {
    /**
     * Single query search
     */
    async singleSearch(params) {
        const {
            query,
            ocr,
            asr,
            models,
            useTrans = true
        } = params;

        const requestData = {
            queries: [query, null, null],
            OCR: [ocr || null, null, null],
            ASR: asr || null,
            ClipH14: [models.cliph14 || false, false, false],
            ClipBigg14: [models.clipbigg14 || false, false, false],
            ImageCap: [models.imagecap || false, false, false],
            Beit3: [models.beit3 || false, false, false],
            SigLip2: [models.siglip2 || false, false, false],
            GoogleSearch: [models.google || false, false, false],
            is_temporal: false,
            use_trans: useTrans
        };

        console.log('🔍 Single Search Request:', requestData);
        return apiClient.post('/api/search-new', requestData);
    },

    /**
     * Temporal query search (3 queries)
     */
    async temporalSearch(params) {
        const {
            queries,
            ocrs,
            asr,
            models,
            useTrans = true
        } = params;

        const requestData = {
            queries: [
                queries[0] || null,
                queries[1] || null,
                queries[2] || null
            ],
            OCR: [
                ocrs[0] || null,
                ocrs[1] || null,
                ocrs[2] || null
            ],
            ASR: asr || null,
            ClipH14: [
                models[0]?.cliph14 || false,
                models[1]?.cliph14 || false,
                models[2]?.cliph14 || false
            ],
            ClipBigg14: [
                models[0]?.clipbigg14 || false,
                models[1]?.clipbigg14 || false,
                models[2]?.clipbigg14 || false
            ],
            ImageCap: [
                models[0]?.imagecap || false,
                models[1]?.imagecap || false,
                models[2]?.imagecap || false
            ],
            Beit3: [
                models[0]?.beit3 || false,
                models[1]?.beit3 || false,
                models[2]?.beit3 || false
            ],
            SigLip2: [
                models[0]?.siglip2 || false,
                models[1]?.siglip2 || false,
                models[2]?.siglip2 || false
            ],
            GoogleSearch: [
                models[0]?.google || false,
                models[1]?.google || false,
                models[2]?.google || false
            ],
            is_temporal: true,
            use_trans: useTrans
        };

        console.log('🔍 Temporal Search Request:', requestData);
        return apiClient.post('/api/search-new', requestData);
    },

    /**
     * Image search (single or temporal)
     */
    async imageSearch(params) {
        const {
            imageId,
            imageIds,
            modelName = 'siglip2',
            topk = 100
        } = params;

        const requestData = {
            image_id: imageId,
            image_ids: imageIds,
            model_name: modelName,
            topk: topk
        };

        console.log('🖼️ Image Search Request:', requestData);
        return apiClient.post('/api/image-search', requestData);
    },

    /**
     * Upload image for search
     */
    async uploadImage(file) {
        console.log('📤 Uploading image:', file.name);
        return apiClient.uploadFile('/api/upload-query-image', file);
    },

    /**
     * Get video frames
     */
    async getVideoFrames(videoId) {
        console.log('🎬 Getting frames for video:', videoId);
        return apiClient.get('/api/video-frames', { video_id: videoId });
    },

    /**
     * Health check
     */
    async healthCheck() {
        return apiClient.get('/health');
    }
};
