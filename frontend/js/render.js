/**
 * Render templates with data
 */

export function renderTemplate(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : '';
    });
}

export async function loadCardTemplate() {
    try {
        const response = await fetch('html/components/card.html');
        return await response.text();
    } catch (error) {
        console.error('Error loading card template:', error);
        return '<div class="card">Error loading template</div>';
    }
}

export function renderCard(cardData) {
    const template = `
        <div class="card" data-id="${cardData.id}">
            <div class="card-image">
                <img src="${cardData.url}" alt="${cardData.title}" loading="lazy" onerror="this.src='/api/placeholder.jpg'">
            </div>
            <div class="card-content">
                <h3 class="card-title">${cardData.title || 'Result ' + cardData.id}</h3>
                <p class="card-description">${cardData.description || 'Search result'}</p>
                <div class="card-meta">
                    <span class="card-score">Score: ${(cardData.score || 0).toFixed(4)}</span>
                    <span class="card-id">ID: ${cardData.id}</span>
                </div>
            </div>
        </div>
    `;
    return template;
}

export function renderResults(results, containerId = 'results-grid') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!results || results.length === 0) {
        container.innerHTML = '<p class="no-results">No results found</p>';
        return;
    }
    
    results.forEach(result => {
        const cardHTML = renderCard(result);
        container.insertAdjacentHTML('beforeend', cardHTML);
    });
}

export function showLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'block';
    }
}

export function hideLoading() {
    const loading = document.getElementById('loading');
    if (loading) {
        loading.style.display = 'none';
    }
}

export function showResults() {
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.style.display = 'block';
    }
}

export function hideResults() {
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }
}
