import path from 'path';
import fs from 'fs';
import { GraphLoader } from './loaders/GraphLoader';
import { AnalysisRegistry } from './AnalysisRegistry';
import { TableFormatter } from './utils/TableFormatter';

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const outputFormat = args.includes('--markdown') ? 'markdown' : 'console';
  const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];
  
  console.log('Graph Data Analyzer');
  console.log('===================\n');
  
  if (outputFormat === 'markdown') {
    console.log('Output format: Markdown');
    if (outputFile) {
      console.log(`Output file: ${outputFile}`);
    }
    console.log('');
  }

  const nodesPath = path.join(__dirname, '../../storage/cert.gov.ua/processed/analyzed-unified/gpt-5/nodes.csv');
  const edgesPath = path.join(__dirname, '../../storage/cert.gov.ua/processed/analyzed-unified/gpt-5/edges.csv');

  console.log('Loading graph data...');
  console.log(`Nodes: ${nodesPath}`);
  console.log(`Edges: ${edgesPath}\n`);

  try {
    const loader = new GraphLoader(nodesPath, edgesPath);
    const graph = await loader.load();

    console.log(`Graph loaded successfully!`);
    console.log(`  Nodes: ${graph.order}`);
    console.log(`  Edges: ${graph.size}\n`);

    const registry = new AnalysisRegistry();
    let markdownOutput = '';
    
    // Define all analyses to run
    const analyses = [
      { type: 'top-incoming-attacks', topN: 10 },
      { type: 'highest-weight-edges', topN: 10 },
      { type: 'active-hacker-groups', topN: 10 },
      { type: 'attack-tools', topN: 15 },
      { type: 'software-targets', topN: 15 }
    ];
    
    for (const analysis of analyses) {
      const analyzer = registry.createAnalyzer(analysis.type as any, graph, analysis.topN);
      if (analyzer) {
        const result = analyzer.run();
        
        if (outputFormat === 'markdown') {
          const markdown = TableFormatter.formatAnalysisResult(result, 'markdown');
          markdownOutput += markdown + '\n---\n\n';
        } else {
          TableFormatter.formatAnalysisResult(result, 'console');
        }
      }
    }
    
    // Save markdown to file if specified
    if (outputFormat === 'markdown' && outputFile) {
      fs.writeFileSync(outputFile, markdownOutput);
      console.log(`\nMarkdown output saved to: ${outputFile}`);
    } else if (outputFormat === 'markdown') {
      console.log('\n=== MARKDOWN OUTPUT ===\n');
      console.log(markdownOutput);
    }

  } catch (error) {
    console.error('Error running analysis:', error);
    process.exit(1);
  }
}

main().catch(console.error);