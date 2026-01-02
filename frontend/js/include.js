/**
 * Include HTML components into page
 */

export async function includeHTML(selector, htmlPath) {
    try {
        const response = await fetch(htmlPath);
        if (!response.ok) {
            throw new Error(`Failed to load ${htmlPath}`);
        }
        const html = await response.text();
        const element = document.querySelector(selector);
        if (element) {
            element.innerHTML = html;
        }
        return true;
    } catch (error) {
        console.error('Error loading HTML:', error);
        return false;
    }
}

export async function loadComponents() {
    await Promise.all([
        includeHTML('#navbar-placeholder', 'html/components/navbar.html'),
        includeHTML('#footer-placeholder', 'html/components/footer.html')
    ]);
}

export async function loadPage(pageName) {
    const mainContent = document.querySelector('#main-content');
    if (!mainContent) return;
    
    try {
        const response = await fetch(`html/pages/${pageName}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load page: ${pageName}`);
        }
        const html = await response.text();
        mainContent.innerHTML = html;
        return true;
    } catch (error) {
        console.error('Error loading page:', error);
        mainContent.innerHTML = '<div class="container"><h2>Page not found</h2></div>';
        return false;
    }
}
