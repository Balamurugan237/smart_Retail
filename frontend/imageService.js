const ImageService = {
    cache: new Map(),

    /**
     * Helper to strip weights and units from product names for cleaner search.
     * e.g., "Full Cream Milk 1L" -> "Full Cream Milk"
     */
    cleanQuery(query) {
        // Remove patterns like "100g", "1L", "50ml", "1kg", "500ml", "1pkt", "1packet" etc.
        // Matches digits followed by units, often at the end or before other specs.
        return query.replace(/\s*\d+(\s*[gG]|[mM][lL]|[kK][gG]|[lL]|[pP][kK][tT]|[pP][aA][cC][kK][eE][tT]).*/i, "").trim();
    },

    /**
     * Simple hash function to turn a string (id) into a number.
     */
    getNumericHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        return Math.abs(hash);
    },

    /**
     * Fetches a high-quality product image.
     * Uses Product ID hashing to pick a unique result from a pool, ensuring diversity.
     */
    async fetchProductImage(productName, productId) {
        const cleanName = this.cleanQuery(productName);
        const cacheKey = `${cleanName.toLowerCase()}_${productId}`;
        
        // 1. Check Cache
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        try {
            // 2. Fetch pool of images from Pexels (if config is available)
            if (typeof CONFIG !== 'undefined' && CONFIG.PEXELS_API_KEY) {
                // Fetch up to 15 results to ensure variety
                const response = await fetch(`${CONFIG.PEXELS_SEARCH_URL}?query=${encodeURIComponent(cleanName)}&per_page=15`, {
                    headers: { 'Authorization': CONFIG.PEXELS_API_KEY }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.photos && data.photos.length > 0) {
                        // Use productId hash to pick a stable yet unique photo for this product
                        const index = this.getNumericHash(productId) % data.photos.length;
                        const imgUrl = data.photos[index].src.medium;
                        
                        this.cache.set(cacheKey, imgUrl);
                        return imgUrl;
                    }
                }
            }
        } catch (error) {
            console.warn(`Pexels fetch failed for "${cleanName}", falling back...`, error);
        }

        // 3. Fallback: LoremFlickr (stable redirect) with the same hashing logic
        const seed = this.getNumericHash(productId) % 20; // Loremflickr supports lock/seed sometimes via different query
        const fallbackUrl = `https://loremflickr.com/800/600/${encodeURIComponent(cleanName)},retail?lock=${seed}`;
        this.cache.set(cacheKey, fallbackUrl);
        return fallbackUrl;
    }
};
