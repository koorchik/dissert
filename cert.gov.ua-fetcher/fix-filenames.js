const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = '../storage/cert.gov.ua/fetched';

async function fixFilenames() {
    try {
        // Get all JSON files
        const files = await fs.readdir(DATA_DIR);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        console.log(`Found ${jsonFiles.length} JSON files to check...`);
        
        let fixedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        const conflicts = [];
        
        for (const filename of jsonFiles) {
            const filePath = path.join(DATA_DIR, filename);
            const expectedId = path.basename(filename, '.json');
            
            try {
                // Read the file
                const content = await fs.readFile(filePath, 'utf8');
                const data = JSON.parse(content);
                
                // Check if the internal ID matches the filename
                if (data.id && data.id.toString() !== expectedId) {
                    const correctFilename = `${data.id}.json`;
                    const correctPath = path.join(DATA_DIR, correctFilename);
                    
                    console.log(`\nMismatch found:`);
                    console.log(`  File: ${filename} (expected ID: ${expectedId})`);
                    console.log(`  Actual ID: ${data.id}`);
                    
                    // Check if correct filename already exists
                    try {
                        await fs.access(correctPath);
                        console.log(`  ⚠️  Correct file ${correctFilename} already exists!`);
                        
                        // Read the existing file to compare
                        const existingContent = await fs.readFile(correctPath, 'utf8');
                        const existingData = JSON.parse(existingContent);
                        
                        if (JSON.stringify(data) === JSON.stringify(existingData)) {
                            console.log(`  ✓ Files are identical, removing duplicate ${filename}`);
                            await fs.unlink(filePath);
                            fixedCount++;
                        } else {
                            console.log(`  ⚠️  Files differ! Manual review needed.`);
                            conflicts.push({
                                wrongFile: filename,
                                correctFile: correctFilename,
                                actualId: data.id
                            });
                            errorCount++;
                        }
                    } catch (error) {
                        // Correct file doesn't exist, safe to rename
                        console.log(`  → Renaming to ${correctFilename}`);
                        await fs.rename(filePath, correctPath);
                        fixedCount++;
                    }
                } else {
                    skippedCount++;
                }
            } catch (error) {
                console.error(`Error processing ${filename}:`, error.message);
                errorCount++;
            }
        }
        
        console.log('\n=== Summary ===');
        console.log(`Files checked: ${jsonFiles.length}`);
        console.log(`Files fixed/removed: ${fixedCount}`);
        console.log(`Files already correct: ${skippedCount}`);
        console.log(`Errors: ${errorCount}`);
        
        if (conflicts.length > 0) {
            console.log('\n⚠️  Conflicts requiring manual review:');
            conflicts.forEach(c => {
                console.log(`  - ${c.wrongFile} → ${c.correctFile} (ID: ${c.actualId})`);
            });
        }
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

// Run the fixer
fixFilenames();