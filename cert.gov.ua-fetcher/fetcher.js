const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://cert.gov.ua';
const DATA_DIR = './data';
const LANG = 'uk';
const DELAY_MS = 500; // Delay between requests to be respectful

async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed for ${url}:`, error.message);
            if (i === maxRetries - 1) throw error;
            await sleep(DELAY_MS * 2);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchAllArticles() {
    const allArticles = [];
    let page = 1;
    let hasMore = true;
    
    console.log('Fetching article list...');
    
    while (hasMore) {
        try {
            console.log(`Fetching page ${page}...`);
            const data = await fetchWithRetry(
                `${BASE_URL}/api/articles/all?page=${page}&lang=${LANG}`,
                {
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'accept-language': 'uk,en-US;q=0.9,en;q=0.8',
                        'cache-control': 'no-cache',
                        'pragma': 'no-cache'
                    },
                    method: 'GET'
                }
            );
            
            // Check if we have data
            if (data) {
                // The API returns articles in 'items' field
                const articles = data.items || [];
                
                if (articles.length > 0) {
                    allArticles.push(...articles);
                    console.log(`Found ${articles.length} articles on page ${page}`);
                    page++;
                    await sleep(DELAY_MS);
                } else {
                    // No more articles
                    hasMore = false;
                }
                
                // Check for explicit pagination info
                if (data.totalPages && page > data.totalPages) {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`Failed to fetch page ${page}:`, error);
            hasMore = false;
        }
    }
    
    console.log(`Total articles found: ${allArticles.length}`);
    return allArticles;
}

async function fetchArticleDetails(articleId) {
    console.log(`Fetching article ${articleId}...`);
    
    try {
        const data = await fetchWithRetry(
            `${BASE_URL}/api/articles/byId?id=${articleId}&lang=${LANG}`,
            {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'uk,en-US;q=0.9,en;q=0.8',
                    'cache-control': 'no-cache',
                    'pragma': 'no-cache',
                    'Referer': `${BASE_URL}/article/${articleId}`
                },
                method: 'GET'
            }
        );
        
        return data;
    } catch (error) {
        console.error(`Failed to fetch article ${articleId}:`, error);
        throw error;
    }
}

async function saveArticle(articleId, articleData) {
    const filePath = path.join(DATA_DIR, `${articleId}.json`);
    await fs.writeFile(filePath, JSON.stringify(articleData, null, 2));
    console.log(`Saved article ${articleId} to ${filePath}`);
}

async function main() {
    try {
        // Ensure data directory exists
        await fs.mkdir(DATA_DIR, { recursive: true });
        
        // Fetch list of all articles
        const articles = await fetchAllArticles();
        
        if (articles.length === 0) {
            console.log('No articles found');
            return;
        }
        
        // Fetch and save each article
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const articleId = article.id;
            
            console.log(`\nProcessing article ${i + 1}/${articles.length} (ID: ${articleId})`);
            
            try {
                const articleDetails = await fetchArticleDetails(articleId);
                await saveArticle(articleId, articleDetails);
                successCount++;
                await sleep(DELAY_MS);
            } catch (error) {
                console.error(`Failed to process article ${articleId}:`, error.message);
                failCount++;
            }
        }
        
        console.log('\n=== Fetching completed ===');
        console.log(`Successfully fetched: ${successCount} articles`);
        console.log(`Failed: ${failCount} articles`);
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the fetcher
main();