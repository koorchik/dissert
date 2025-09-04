import { SecurityGraph } from '../models/Graph';

export interface TableSection {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  columnWidths?: number[];
  headerStyle?: string;
  showCount?: {
    showing: number;
    total: number;
  };
}

export interface MetricsSummary {
  title: string;
  metrics: Array<{
    label: string;
    value: string | number;
  }>;
}

export interface AnalysisOutput {
  summary?: MetricsSummary;
  sections: TableSection[];
}

export interface AnalysisResult {
  name: string;
  description: string;
  data: any;
  output: AnalysisOutput;
  metadata?: {
    executionTime?: number;
    timestamp?: string;
    [key: string]: any;
  };
}

export abstract class BaseAnalyzer {
  protected graph: SecurityGraph;
  
  constructor(graph: SecurityGraph) {
    this.graph = graph;
  }

  abstract getName(): string;
  abstract getDescription(): string;
  abstract analyze(): AnalysisResult;

  protected measureExecutionTime<T>(fn: () => T): [T, number] {
    const start = Date.now();
    const result = fn();
    const duration = Date.now() - start;
    return [result, duration];
  }

  run(): AnalysisResult {
    const [data, executionTime] = this.measureExecutionTime(() => this.analyze());
    return {
      ...data,
      metadata: {
        ...data.metadata,
        executionTime: executionTime / 1000,
        timestamp: new Date().toISOString()
      }
    };
  }
}