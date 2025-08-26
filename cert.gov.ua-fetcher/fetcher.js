const fs = require('fs').promises;
const path = require('path');

const BASE_URL = 'https://cert.gov.ua';
const DATA_DIR = '../storage/cert.gov.ua/fetched';
const LANG = 'uk';
const DELAY_MS = 1000; // Delay between requests to be respectful (increased to avoid rate limiting)

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
            const listUrl = `${BASE_URL}/api/articles/all?page=${page}&lang=${LANG}`;
            console.log(`Fetching page ${page} from: ${listUrl}`);
            const data = await fetchWithRetry(
                listUrl,
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

async function fetchArticleDetails(articleId, retryForMismatch = true) {
    const articleUrl = `${BASE_URL}/api/articles/byId?id=${articleId}&lang=${LANG}`;
    console.log(`Fetching article ${articleId} from: ${articleUrl}`);
    
    try {
        const data = await fetchWithRetry(
            articleUrl,
            {
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'accept-language': 'uk,en-US;q=0.9,en;q=0.8',
                    'cache-control': 'no-cache',
                    'pragma': 'no-cache',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': `${BASE_URL}/article/${articleId}`
                },
                method: 'GET'
            }
        );
        
        // Check for ID mismatch and retry if needed
        if (data && data.id && data.id !== articleId && retryForMismatch) {
            console.log(`  ID mismatch detected (got ${data.id} instead of ${articleId}), waiting and retrying...`);
            await sleep(2000); // Wait 2 seconds before retry
            
            // Clear any potential cache by adding timestamp
            const retryUrl = `${articleUrl}&_t=${Date.now()}`;
            console.log(`  Retrying with cache-bust: ${retryUrl}`);
            
            const retryData = await fetchWithRetry(
                retryUrl,
                {
                    headers: {
                        'accept': 'application/json, text/plain, */*',
                        'accept-language': 'uk,en-US;q=0.9,en;q=0.8',
                        'cache-control': 'no-cache, no-store, must-revalidate',
                        'pragma': 'no-cache',
                        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Referer': `${BASE_URL}/article/${articleId}`
                    },
                    method: 'GET'
                }
            );
            
            if (retryData && retryData.id === articleId) {
                console.log(`  ✓ Retry successful, got correct article ${articleId}`);
                return retryData;
            } else if (retryData && retryData.id !== articleId) {
                console.log(`  ✗ Retry still returned wrong article (${retryData.id}), using it anyway`);
                return retryData;
            }
        }
        
        return data;
    } catch (error) {
        console.error(`Failed to fetch article ${articleId}:`, error);
        throw error;
    }
}

async function saveArticle(requestedId, articleData) {
    // Always save with the requested ID as filename to maintain consistency
    const filePath = path.join(DATA_DIR, `${requestedId}.json`);
    
    // Check if file already exists
    try {
        await fs.access(filePath);
        console.log(`  Article ${requestedId} already exists, skipping...`);
        return false; // Return false to indicate no fetch was needed
    } catch (error) {
        // File doesn't exist, proceed with saving
    }
    
    // Add metadata about the request
    const dataToSave = {
        ...articleData,
        _meta: {
            requestedId: requestedId,
            actualId: articleData.id,
            fetchedAt: new Date().toISOString(),
            idMismatch: requestedId !== articleData.id
        }
    };
    
    await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2));
    console.log(`  Saved article ${requestedId} to ${filePath}`);
    if (requestedId !== articleData.id) {
        console.log(`    Note: Content has ID ${articleData.id} but saved as ${requestedId}.json`);
    }
    return true; // Return true to indicate a new file was saved
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
            
            // Check if file already exists before fetching
            const filePath = path.join(DATA_DIR, `${articleId}.json`);
            try {
                await fs.access(filePath);
                console.log(`  Article ${articleId} already exists, skipping...`);
                successCount++;
                continue; // Skip to next article without delay
            } catch (error) {
                // File doesn't exist, proceed with fetching
            }
            
            try {
                const articleDetails = await fetchArticleDetails(articleId);
                
                // Validate the response
                if (!articleDetails || typeof articleDetails !== 'object') {
                    console.error(`  Invalid response for article ${articleId}`);
                    failCount++;
                    await sleep(DELAY_MS);
                    continue;
                }
                
                // Check for persistent ID mismatch after retry
                const actualArticleId = articleDetails.id;
                if (actualArticleId && actualArticleId !== articleId) {
                    console.log(`  WARNING: API persistently returns different article!`);
                    console.log(`    Requested: ${articleId}`);
                    console.log(`    Received: ${actualArticleId}`);
                    console.log(`    Title: ${articleDetails.title ? articleDetails.title.substring(0, 60) + '...' : 'N/A'}`);
                }
                
                // Save with the requested ID to maintain consistency
                const wasSaved = await saveArticle(articleId, articleDetails);
                if (wasSaved) {
                    successCount++;
                    // Add extra delay after successful fetch to be nice to the server
                    await sleep(DELAY_MS);
                } else {
                    // File already exists, no delay needed
                }
            } catch (error) {
                console.error(`Failed to process article ${articleId}:`, error.message);
                failCount++;
                // Still add delay on error to avoid hammering the server
                await sleep(DELAY_MS);
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