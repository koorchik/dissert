# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Node.js data fetcher that collects cybersecurity incident reports from the Ukrainian CERT (cert.gov.ua) for dissertation research on Ukrainian cybersecurity threats. The fetcher systematically retrieves incident reports and stores them as JSON files for later analysis by the LLM-based processing framework.

## Common Commands

```bash
# Run the fetcher to collect new incident reports
npm start

# Install dependencies (currently none required beyond Node.js built-ins)
npm install
```

## Architecture

### Core Components

1. **fetcher.js** - Main fetching logic with two-phase approach:
   - Phase 1: Retrieve paginated article list from cert.gov.ua API
   - Phase 2: Fetch individual article details for each ID
   - Implements retry logic (3 attempts with exponential backoff)
   - Respectful rate limiting (500ms delay between requests)

### Data Flow

```
cert.gov.ua API → fetcher.js → ../storage/cert.gov.ua/fetched/{id}.json
```

Each fetched article is stored as an individual JSON file named by its ID. The fetcher tracks already-fetched articles to avoid duplicates.

### Storage Structure

- **Fetched data**: `../storage/cert.gov.ua/fetched/` - Raw JSON files from cert.gov.ua API
- **File naming**: Articles stored as `{articleId}.json`

### Key Configuration

- **API Base URL**: `https://cert.gov.ua`
- **Language**: Ukrainian (`uk`)
- **Delay between requests**: 500ms
- **Retry attempts**: 3 with exponential backoff

## Integration Context

This fetcher is part of a larger dissertation system:

1. **cert.gov.ua-fetcher** (this project) - Collects raw incident reports
2. **llm-basic-framework** - Processes collected data using multiple LLMs to extract structured information about cybersecurity incidents
3. **Storage** - Shared data storage location for both raw and processed data

## Known Issues

**File naming inconsistency**: Some JSON files have names that don't match their internal document IDs. For example, `37788.json` contains a document with ID 37815. This needs to be fixed to ensure consistency.

## Development Notes

- No test suite currently exists
- Uses vanilla JavaScript (not TypeScript like the processing framework)
- Minimal external dependencies - relies on Node.js built-in modules
- Requires Node.js >= 18.0.0