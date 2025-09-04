import { BaseAnalyzer, AnalysisResult, AnalysisOutput, TableSection, MetricsSummary } from './BaseAnalyzer';
import { SecurityGraph } from '../models/Graph';

interface SoftwareTargetProfile {
  nodeId: string;
  label: string;
  entityType: string;
  riskScore: number;
  firstSeenDate: string;
  totalIncomingAttacks: number;
  totalAttackWeight: number;
  uniqueAttackers: number;
  
  attackedByGroups: Array<{
    groupId: string;
    groupLabel: string;
    attackWeight: number;
    attackCount: number;
    relationshipType: string;
    firstAttack: string;
  }>;
  
  attackedByTools: Array<{
    toolId: string;
    toolLabel: string;
    toolType: string;
    attackWeight: number;
    relationshipType: string;
  }>;
  
  // Context relationships (mentioned with attacks)
  mentionedWith: Array<{
    entityId: string;
    entityLabel: string;
    entityType: string;
    weight: number;
  }>;
}

interface SoftwareTargetResult {
  rank: number;
  label: string;
  type: string;
  totalAttacks: number;
  totalWeight: number;
  uniqueAttackers: number;
  riskScore: number;
  firstSeen: string;
  
  topHackerGroups: Array<{
    group: string;
    attacks: number;
    weight: number;
    firstAttack: string;
  }>;
  
  topAttackingTools: Array<{
    tool: string;
    toolType: string;
    weight: number;
  }>;
  
  associatedEntities: Array<{
    entity: string;
    type: string;
    weight: number;
  }>;
  
  hasDirectGroupAttacks: boolean;
  hasToolAttacks: boolean;
  totalGroupAttackers: number;
  totalToolAttackers: number;
}

export class SoftwareTargetsAnalyzer extends BaseAnalyzer {
  private topN: number;

  constructor(graph: SecurityGraph, topN: number = 15) {
    super(graph);
    this.topN = topN;
  }

  getName(): string {
    return 'Software Under Attack Analysis';
  }

  getDescription(): string {
    return `Analyzes software that are targets of attacks, showing which groups and tools are attacking them`;
  }

  analyze(): AnalysisResult {
    const softwareTargets = new Map<string, SoftwareTargetProfile>();
    
    // First, identify all software nodes
    this.graph.forEachNode((nodeId, attrs) => {
      if (attrs.entityType === 'Software') {
        softwareTargets.set(nodeId, {
          nodeId,
          label: attrs.label,
          entityType: attrs.entityType,
          riskScore: attrs.riskScore,
          firstSeenDate: attrs.firstSeenDate,
          totalIncomingAttacks: 0,
          totalAttackWeight: 0,
          uniqueAttackers: 0,
          attackedByGroups: [],
          attackedByTools: [],
          mentionedWith: []
        });
      }
    });

    // Analyze incoming relationships to software
    this.graph.forEachDirectedEdge((edgeId, attrs, source, target) => {
      const sourceAttrs = this.graph.getNodeAttributes(source);
      const targetSoftware = softwareTargets.get(target);
      
      if (!targetSoftware) return;

      switch (attrs.edgeType) {
        case 'attacks':
          targetSoftware.totalIncomingAttacks++;
          targetSoftware.totalAttackWeight += attrs.weight;
          
          if (sourceAttrs.entityType === 'HackerGroup') {
            targetSoftware.attackedByGroups.push({
              groupId: source,
              groupLabel: sourceAttrs.label,
              attackWeight: attrs.weight,
              attackCount: 1,
              relationshipType: attrs.edgeType,
              firstAttack: attrs.date
            });
          } else {
            // Attack from other software/tools
            targetSoftware.attackedByTools.push({
              toolId: source,
              toolLabel: sourceAttrs.label,
              toolType: sourceAttrs.entityType,
              attackWeight: attrs.weight,
              relationshipType: attrs.edgeType
            });
          }
          break;
          
        case 'mentioned_in_context_of':
        case 'related_to':
          targetSoftware.mentionedWith.push({
            entityId: source,
            entityLabel: sourceAttrs.label,
            entityType: sourceAttrs.entityType,
            weight: attrs.weight
          });
          break;
      }
    });

    // Aggregate group attacks (same group might attack multiple times)
    softwareTargets.forEach(software => {
      const groupAttacks = new Map<string, typeof software.attackedByGroups[0]>();
      
      software.attackedByGroups.forEach(attack => {
        const existing = groupAttacks.get(attack.groupId);
        if (existing) {
          existing.attackWeight += attack.attackWeight;
          existing.attackCount += attack.attackCount;
          if (attack.firstAttack < existing.firstAttack) {
            existing.firstAttack = attack.firstAttack;
          }
        } else {
          groupAttacks.set(attack.groupId, { ...attack });
        }
      });
      
      software.attackedByGroups = Array.from(groupAttacks.values());
      software.uniqueAttackers = new Set([
        ...software.attackedByGroups.map(a => a.groupId),
        ...software.attackedByTools.map(a => a.toolId)
      ]).size;
    });

    // Filter to only software that are actually under attack
    const attackedSoftware = Array.from(softwareTargets.values())
      .filter(software => software.totalIncomingAttacks > 0);

    // Sort by total attack weight, then by number of unique attackers
    attackedSoftware.sort((a, b) => {
      if (b.totalAttackWeight !== a.totalAttackWeight) {
        return b.totalAttackWeight - a.totalAttackWeight;
      }
      return b.uniqueAttackers - a.uniqueAttackers;
    });

    // Convert to analysis results
    const softwareResults: SoftwareTargetResult[] = attackedSoftware
      .slice(0, this.topN)
      .map((software, index) => {
        // Sort attackers by attack weight
        software.attackedByGroups.sort((a, b) => b.attackWeight - a.attackWeight);
        software.attackedByTools.sort((a, b) => b.attackWeight - a.attackWeight);
        software.mentionedWith.sort((a, b) => b.weight - a.weight);

        return {
          rank: index + 1,
          label: software.label,
          type: software.entityType,
          totalAttacks: software.totalIncomingAttacks,
          totalWeight: software.totalAttackWeight,
          uniqueAttackers: software.uniqueAttackers,
          riskScore: software.riskScore,
          firstSeen: software.firstSeenDate,
          
          topHackerGroups: software.attackedByGroups.slice(0, 3).map(attack => ({
            group: attack.groupLabel.substring(0, 30),
            attacks: attack.attackCount,
            weight: attack.attackWeight,
            firstAttack: attack.firstAttack
          })),
          
          topAttackingTools: software.attackedByTools.slice(0, 8).map(tool => ({
            tool: tool.toolLabel.substring(0, 30),
            toolType: tool.toolType,
            weight: tool.attackWeight
          })),
          
          associatedEntities: software.mentionedWith
            .filter(entity => entity.entityType === 'HackerGroup' || entity.entityType === 'Country')
            .slice(0, 5).map(entity => ({
              entity: entity.entityLabel.substring(0, 30),
              type: entity.entityType,
              weight: entity.weight
            })),
          
          hasDirectGroupAttacks: software.attackedByGroups.length > 0,
          hasToolAttacks: software.attackedByTools.length > 0,
          totalGroupAttackers: software.attackedByGroups.length,
          totalToolAttackers: software.attackedByTools.length
        };
      });

    // Calculate summary statistics
    const totalSoftwareNodes = softwareTargets.size;
    const attackedSoftwareCount = attackedSoftware.length;
    const totalAttackWeight = attackedSoftware.reduce((sum, s) => sum + s.totalAttackWeight, 0);
    
    const softwareWithGroupAttacks = attackedSoftware.filter(s => s.attackedByGroups.length > 0).length;
    const softwareWithToolAttacks = attackedSoftware.filter(s => s.attackedByTools.length > 0).length;

    const summary = {
      totalSoftwareNodes,
      softwareUnderAttack: attackedSoftwareCount,
      softwareNotAttacked: totalSoftwareNodes - attackedSoftwareCount,
      totalAttackWeight,
      averageAttackWeight: attackedSoftwareCount > 0 ? parseFloat((totalAttackWeight / attackedSoftwareCount).toFixed(2)) : 0,
      softwareWithGroupAttacks,
      softwareWithToolAttacks,
      softwareWithBothAttackTypes: attackedSoftware.filter(s => s.attackedByGroups.length > 0 && s.attackedByTools.length > 0).length,
      mostAttackedSoftwareWeight: softwareResults.length > 0 ? softwareResults[0].totalWeight : 0,
      averageAttackersPerSoftware: attackedSoftwareCount > 0 ? parseFloat((attackedSoftware.reduce((sum, s) => sum + s.uniqueAttackers, 0) / attackedSoftwareCount).toFixed(2)) : 0
    };

    const sections: TableSection[] = [];

    // Add section for each software target
    softwareResults.forEach(software => {
      // Top hacker groups attacking this software
      if (software.topHackerGroups && software.topHackerGroups.length > 0) {
        sections.push({
          title: `${software.rank}. ${software.label} - Attacking Groups (${software.totalAttacks} attack relations from ${software.totalGroupAttackers} groups + ${software.totalToolAttackers} tools/methods)`,
          headers: ['Hacker Group', 'Attack Relations', 'Total Weight', 'First Attack'],
          columnWidths: [30, 15, 12, 15],
          headerStyle: 'red',
          rows: software.topHackerGroups.map(group => [
            group.group,
            group.attacks,
            group.weight,
            group.firstAttack
          ]),
          showCount: { showing: software.topHackerGroups.length, total: software.totalGroupAttackers }
        });
      }
      
      // Tools used to attack this software
      if (software.topAttackingTools && software.topAttackingTools.length > 0) {
        sections.push({
          title: `${software.label} - Attack Methods/Tools`,
          headers: ['Tool/Method', 'Type', 'Weight'],
          columnWidths: [35, 15, 10],
          headerStyle: 'red',
          rows: software.topAttackingTools.map(tool => [
            tool.tool,
            tool.toolType,
            tool.weight
          ]),
          showCount: { showing: software.topAttackingTools.length, total: software.totalToolAttackers }
        });
      }
      
      // Associated entities (mentioned with)
      if (software.associatedEntities && software.associatedEntities.length > 0) {
        sections.push({
          title: `${software.label} - Associated With`,
          headers: ['Entity', 'Type', 'Weight'],
          columnWidths: [35, 15, 10],
          headerStyle: 'red',
          rows: software.associatedEntities.map(entity => [
            entity.entity,
            entity.type,
            entity.weight
          ])
        });
      }
    });

    const output: AnalysisOutput = {
      summary: {
        title: 'KEY METRICS',
        metrics: [
          { label: 'totalSoftwareNodes', value: summary.totalSoftwareNodes },
          { label: 'softwareUnderAttack', value: summary.softwareUnderAttack },
          { label: 'mostAttackedSoftwareWeight', value: summary.mostAttackedSoftwareWeight },
          { label: 'averageAttackersPerSoftware', value: summary.averageAttackersPerSoftware },
          { label: 'softwareWithGroupAttacks', value: summary.softwareWithGroupAttacks },
          { label: 'softwareWithToolAttacks', value: summary.softwareWithToolAttacks }
        ]
      },
      sections
    };

    return {
      name: this.getName(),
      description: this.getDescription(),
      data: {
        summary,
        softwareResults,
        parameters: {
          topN: this.topN
        }
      },
      output
    };
  }
}