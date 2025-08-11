# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based LLM framework for analyzing Ukrainian cybersecurity incident reports from CERT-UA. The application processes unstructured text reports to extract structured entities (attack targets, hacker groups, countries), normalize data, generate embeddings, and create visualizations.

## Key Commands

### Development
```bash
# Run the main application
npm start

# The application runs through three processing stages:
# 1. Data extraction from raw reports
# 2. Data normalization and embedding generation  
# 3. Data analysis and visualization

# Note: No test framework is configured yet
# npm test returns "Not implemented yet"
```

### Environment Setup
Create a `.env` file with these required variables:
```
OPENAI_API_KEY=your_key
VERTEXAI_PROJECT=your_project
VERTEXAI_LOCATION=your_location
ANTHROPIC_API_KEY=your_key
```

## Architecture

### Processing Pipeline
The application follows a 3-stage pipeline orchestrated by `FlowManager`:

1. **DataExtractor** (`src/DataProcessors/DataExtractor.ts`)
   - Reads incident reports from `storage/data/cert.gov.ua-news/`
   - Uses LLM to extract entities: attack targets, hacker groups, countries, malware, etc.
   - Outputs to `storage/output/raw/{model-name}/`

2. **DataNormalizer** (`src/DataProcessors/DataNormalizer.ts`)
   - Normalizes country names using `CountryNameNormalizer`
   - Generates embeddings for attack targets
   - Outputs to `storage/output/normalized/{model-name}/`

3. **DataAnalyzer** (`src/DataProcessors/DataAnalyzer.ts`)
   - Performs statistical analysis
   - Creates t-SNE visualizations of embeddings
   - Outputs to `storage/output/analyzed/{model-name}/`

### Multi-LLM Architecture
The system supports multiple LLM backends through a plugin architecture:
- **LlmClient** (`src/LlmClient/LlmClient.ts`) - Main client interface
- Backends: OpenAI, Anthropic, Ollama, Google Vertex AI
- **EmbeddingsClient** (`src/EmbeddingsClient/EmbeddingsClient.ts`) - For text embeddings
- Backends: OpenAI, Ollama, Google Vertex AI

### Key Components
- **Normalizer** (`src/Normalizer/`) - General text normalization utilities
- **validationUtils** (`src/utils/validationUtils.ts`) - LIVR-based validation
- Custom TypeScript definitions in `src/types/` for external libraries

## Development Notes

### Modifying the Pipeline
To change which steps run, edit `bin/app.ts:79`:
```typescript
// Run single step:
await flowManager.runStep("dataExtractor");

// Run all steps:
// await flowManager.runAllSteps();
```

### Switching LLM Models
Models are configured in `bin/app.ts` in the `makeLlmClient()` and `makeEmbeddingsClient()` functions. 

### Code Conventions
- No build process - uses ts-node for direct TypeScript execution
- Entry point: `bin/app.ts`
- All processors follow constructor injection pattern with config objects
- Data flows through directories under `storage/`
- Model names in paths replace colons with hyphens (e.g., `llama3.1:70b` → `llama3.1-70b`)