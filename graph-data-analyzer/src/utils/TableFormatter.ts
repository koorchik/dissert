import Table from 'cli-table3';
import { markdownTable } from 'markdown-table';
import { AnalysisResult, TableSection, MetricsSummary } from '../analyzers/BaseAnalyzer';

export type OutputFormat = 'console' | 'markdown';

export class TableFormatter {
  static formatAnalysisResult(result: AnalysisResult, format: OutputFormat = 'console'): string {
    if (format === 'markdown') {
      return this.formatMarkdown(result);
    } else {
      this.formatConsole(result);
      return '';
    }
  }

  private static formatConsole(result: AnalysisResult): void {
    console.log('\n' + '='.repeat(80));
    console.log(`ANALYSIS: ${result.name}`);
    console.log(`Description: ${result.description}`);
    console.log('='.repeat(80));

    if (result.metadata) {
      console.log(`\nExecution Time: ${result.metadata.executionTime}s`);
      console.log(`Timestamp: ${result.metadata.timestamp}`);
    }

    // Render the generic output
    this.renderOutput(result.output, 'console');
    
    console.log('\n' + '='.repeat(80) + '\n');
  }

  private static formatMarkdown(result: AnalysisResult): string {
    let markdown = '';
    
    markdown += `# ${result.name}\n\n`;
    markdown += `${result.description}\n\n`;
    
    if (result.metadata) {
      markdown += `**Execution Time:** ${result.metadata.executionTime}s  \n`;
      markdown += `**Timestamp:** ${result.metadata.timestamp}\n\n`;
    }
    
    markdown += this.renderOutput(result.output, 'markdown');
    
    return markdown;
  }

  static renderOutput(output: { summary?: MetricsSummary; sections: TableSection[] }, format: OutputFormat = 'console'): string {
    if (format === 'markdown') {
      let markdown = '';
      
      // Render summary if provided
      if (output.summary) {
        markdown += this.renderSummary(output.summary, 'markdown');
      }

      // Render all sections
      output.sections.forEach(section => {
        markdown += this.renderSection(section, 'markdown');
      });
      
      return markdown;
    } else {
      // Render summary if provided
      if (output.summary) {
        this.renderSummary(output.summary, 'console');
      }

      // Render all sections
      output.sections.forEach(section => {
        this.renderSection(section, 'console');
      });
      
      return '';
    }
  }

  static renderSummary(summary: MetricsSummary, format: OutputFormat = 'console'): string {
    if (format === 'markdown') {
      const tableData = [
        ['Metric', 'Value'],
        ...summary.metrics.map(metric => [metric.label, String(metric.value)])
      ];
      
      const markdown = `### ${summary.title}\n\n${markdownTable(tableData)}\n\n`;
      return markdown;
    } else {
      console.log(`\n${summary.title}:`);
      const table = new Table({
        head: ['Metric', 'Value'],
        colWidths: [30, 15],
        style: { head: ['cyan'] }
      });

      summary.metrics.forEach(metric => {
        table.push([metric.label, String(metric.value)]);
      });
      console.log(table.toString());
      return '';
    }
  }

  static renderSection(section: TableSection, format: OutputFormat = 'console'): string {
    if (format === 'markdown') {
      let markdown = `### ${section.title}\n\n`;
      
      if (section.showCount) {
        markdown += `*(showing ${section.showCount.showing} of ${section.showCount.total})*\n\n`;
      }
      
      if (section.rows.length === 0) {
        markdown += '*No data found*\n\n';
        return markdown;
      }
      
      // Create table data with headers and rows
      const tableData = [
        section.headers,
        ...section.rows.map(row => row.map(cell => String(cell)))
      ];
      
      markdown += markdownTable(tableData) + '\n\n';
      return markdown;
    } else {
      console.log(`\n${section.title}:`);
      console.log('-'.repeat(80));

      if (section.showCount) {
        console.log(`\n  (showing ${section.showCount.showing} of ${section.showCount.total})`);
      }

      if (section.rows.length === 0) {
        console.log('  No data found');
        return '';
      }

      const table = new Table({
        head: section.headers,
        colWidths: section.columnWidths,
        style: { head: [section.headerStyle || 'cyan'] }
      });

      section.rows.forEach(row => {
        table.push(row.map(cell => String(cell)));
      });

      console.log(table.toString());
      return '';
    }
  }
}