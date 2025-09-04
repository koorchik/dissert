import { BaseAnalyzer } from './analyzers/BaseAnalyzer';
import { SecurityGraph } from './models/Graph';
import { TopIncomingAttacksAnalyzer } from './analyzers/TopIncomingAttacksAnalyzer';
import { HighestWeightEdgesAnalyzer } from './analyzers/HighestWeightEdgesAnalyzer';
import { ActiveHackerGroupsAnalyzer } from './analyzers/ActiveHackerGroupsAnalyzer';
import { AttackToolsAnalyzer } from './analyzers/AttackToolsAnalyzer';
import { SoftwareTargetsAnalyzer } from './analyzers/SoftwareTargetsAnalyzer';

export class AnalysisRegistry {
  private analyzers: Map<string, typeof BaseAnalyzer> = new Map();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.register('top-incoming-attacks', TopIncomingAttacksAnalyzer);
    this.register('highest-weight-edges', HighestWeightEdgesAnalyzer);
    this.register('active-hacker-groups', ActiveHackerGroupsAnalyzer);
    this.register('attack-tools', AttackToolsAnalyzer);
    this.register('software-targets', SoftwareTargetsAnalyzer);
  }

  register(name: string, analyzerClass: typeof BaseAnalyzer): void {
    this.analyzers.set(name, analyzerClass);
  }

  createAnalyzer(name: string, graph: SecurityGraph, ...args: any[]): BaseAnalyzer | null {
    const AnalyzerClass = this.analyzers.get(name);
    if (!AnalyzerClass) {
      console.error(`Analyzer '${name}' not found in registry`);
      return null;
    }
    return new (AnalyzerClass as any)(graph, ...args);
  }

  getAvailableAnalyzers(): string[] {
    return Array.from(this.analyzers.keys());
  }

  runAll(graph: SecurityGraph): void {
    console.log(`Running all ${this.analyzers.size} registered analyzers...\n`);
    
    this.analyzers.forEach((AnalyzerClass, name) => {
      console.log(`Running analyzer: ${name}`);
      const analyzer = new (AnalyzerClass as any)(graph);
      const result = analyzer.run();
      
      const TableFormatter = require('./utils/TableFormatter').TableFormatter;
      TableFormatter.formatAnalysisResult(result);
    });
  }
}