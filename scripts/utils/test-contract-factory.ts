import { Contract, ContractStatus } from '../../src/domain/entities/Contract';
import { Party } from '../../src/domain/entities/Party';
import { ContractEventData } from '../../src/domain/entities/BettingStats';

export interface ContractScenario {
  id: string;
  name: string;
  topic: string;
  description: string;
  partyA: {
    name: string;
    description: string;
  };
  partyB: {
    name: string;
    description: string;
  };
  category: 'sports' | 'politics' | 'crypto' | 'entertainment' | 'science' | 'general';
  expectedAnalysisComplexity: 'low' | 'medium' | 'high';
}

export class TestContractFactory {
  private static readonly SCENARIOS: ContractScenario[] = [
    {
      id: 'nba_finals',
      name: 'NBA Finals Championship',
      topic: 'NBA Finals 2024 Championship Winner',
      description: 'Prediction market for the NBA Finals 2024 championship winner between Lakers and Celtics. Winner determined by official NBA championship results.',
      partyA: {
        name: 'Los Angeles Lakers',
        description: 'Professional basketball team from Los Angeles, 17-time NBA champions with strong roster including LeBron James and Anthony Davis. High offensive capabilities and playoff experience.'
      },
      partyB: {
        name: 'Boston Celtics',
        description: 'Professional basketball team from Boston, 17-time NBA champions with deep roster and strong defensive capabilities. Led by Jayson Tatum and strong team chemistry.'
      },
      category: 'sports',
      expectedAnalysisComplexity: 'medium'
    },
    {
      id: 'presidential_election',
      name: 'US Presidential Election',
      topic: '2024 US Presidential Election Winner',
      description: 'Prediction market for the 2024 United States Presidential Election outcome. Winner determined by official electoral college results and certification by Congress.',
      partyA: {
        name: 'Democratic Candidate',
        description: 'Democratic Party nominee for the 2024 Presidential Election. Platform focuses on healthcare, climate action, and social justice. Strong support in urban areas and among younger voters.'
      },
      partyB: {
        name: 'Republican Candidate', 
        description: 'Republican Party nominee for the 2024 Presidential Election. Platform emphasizes economic growth, traditional values, and strong defense. Strong support in rural areas and among conservative voters.'
      },
      category: 'politics',
      expectedAnalysisComplexity: 'high'
    },
    {
      id: 'bitcoin_100k',
      name: 'Bitcoin Price Milestone',
      topic: 'Bitcoin Price Prediction - Will BTC reach $100k in 2024?',
      description: 'Prediction on whether Bitcoin will reach $100,000 USD by December 31, 2024. Price determined by major exchanges including Coinbase, Binance, and Kraken.',
      partyA: {
        name: 'Yes - BTC reaches $100k',
        description: 'Bitcoin reaches $100,000 USD by end of 2024. Supported by institutional adoption, ETF approvals, halving effects, and growing mainstream acceptance of cryptocurrency.'
      },
      partyB: {
        name: 'No - BTC does not reach $100k',
        description: 'Bitcoin does not reach $100,000 USD by end of 2024. Market volatility, regulatory concerns, macroeconomic factors, and technical resistance may prevent this milestone.'
      },
      category: 'crypto',
      expectedAnalysisComplexity: 'high'
    },
    {
      id: 'climate_record',
      name: 'Global Temperature Record',
      topic: '2024 Global Temperature Record',
      description: 'Prediction on whether 2024 will set a new global average temperature record. Data sourced from NASA GISS, NOAA, and other climate monitoring organizations.',
      partyA: {
        name: 'Yes - New record set',
        description: '2024 sets new global average temperature record. El Niño effects, continued greenhouse gas emissions, and climate feedback loops support record-breaking temperatures.'
      },
      partyB: {
        name: 'No - No new record',
        description: '2024 does not set new global temperature record. La Niña transition, volcanic activity, or other climate variability factors prevent new record despite long-term warming trend.'
      },
      category: 'science',
      expectedAnalysisComplexity: 'high'
    },
    {
      id: 'oscars_best_picture',
      name: 'Academy Awards Best Picture',
      topic: '2024 Academy Awards Best Picture Winner',
      description: 'Prediction market for the Best Picture winner at the 2024 Academy Awards ceremony. Winner determined by Academy of Motion Picture Arts and Sciences voting.',
      partyA: {
        name: 'Oppenheimer',
        description: 'Christopher Nolan biographical thriller about J. Robert Oppenheimer and the Manhattan Project. Critical acclaim, box office success, and historical significance make it strong contender.'
      },
      partyB: {
        name: 'Barbie',
        description: 'Greta Gerwig fantasy comedy starring Margot Robbie and Ryan Gosling. Cultural phenomenon with massive box office success and unique blend of entertainment and social commentary.'
      },
      category: 'entertainment',
      expectedAnalysisComplexity: 'medium'
    },
    {
      id: 'ai_breakthrough',
      name: 'AI Breakthrough Achievement',
      topic: 'Major AI Breakthrough in 2024',
      description: 'Prediction on whether a major AI breakthrough will be announced in 2024, defined as AGI announcement, consciousness claim, or Nobel Prize in AI-related field.',
      partyA: {
        name: 'Yes - Major breakthrough',
        description: 'Major AI breakthrough occurs in 2024. Rapid progress in LLMs, reasoning capabilities, robotics, or scientific discovery leads to significant milestone announcement.'
      },
      partyB: {
        name: 'No - Incremental progress only',
        description: 'No major breakthrough in 2024, only incremental progress. Current limitations in reasoning, hallucination, and general intelligence prevent dramatic leaps forward.'
      },
      category: 'science',
      expectedAnalysisComplexity: 'high'
    },
    {
      id: 'simple_coin_flip',
      name: 'Simple Test Case',
      topic: 'Test Agreement Topic',
      description: 'Simple test case for basic oracle functionality testing. Winner should be determined randomly for testing purposes.',
      partyA: {
        name: 'Test Option A',
        description: 'First test option with basic description for system testing and validation. Should provide clear differentiation for AI analysis.'
      },
      partyB: {
        name: 'Test Option B',
        description: 'Second test option with basic description for system testing and validation. Should provide clear alternative for AI analysis.'
      },
      category: 'general',
      expectedAnalysisComplexity: 'low'
    }
  ];

  static getScenario(scenarioId: string): ContractScenario | null {
    return this.SCENARIOS.find(s => s.id === scenarioId) || null;
  }

  static getAllScenarios(): ContractScenario[] {
    return [...this.SCENARIOS];
  }

  static getScenariosByCategory(category: ContractScenario['category']): ContractScenario[] {
    return this.SCENARIOS.filter(s => s.category === category);
  }

  static getScenariosByComplexity(complexity: ContractScenario['expectedAnalysisComplexity']): ContractScenario[] {
    return this.SCENARIOS.filter(s => s.expectedAnalysisComplexity === complexity);
  }

  static createTestContract(
    scenarioId: string, 
    options: {
      contractId?: string;
      bettingEndTime?: Date;
      status?: ContractStatus;
      winnerRewardPercentage?: number;
      creator?: string;
    } = {}
  ): Contract | null {
    const scenario = this.getScenario(scenarioId);
    if (!scenario) {
      return null;
    }

    const contractId = options.contractId || `test_${scenarioId}_${Date.now()}`;
    const bettingEndTime = options.bettingEndTime || new Date(Date.now() - 3600000); // 1 hour ago by default
    const status = options.status || ContractStatus.BETTING_CLOSED;
    const winnerRewardPercentage = options.winnerRewardPercentage || 10;
    const creator = options.creator || '0x1234567890123456789012345678901234567890';

    // Create Party entities
    const partyA = new Party(
      `${contractId}:1`,
      '', // address will be retrieved from blockchain if needed
      scenario.partyA.name,
      scenario.partyA.description
    );

    const partyB = new Party(
      `${contractId}:2`,
      '', // address will be retrieved from blockchain if needed
      scenario.partyB.name,
      scenario.partyB.description
    );

    // Create Contract entity
    return new Contract(
      contractId,
      `0xtest${Date.now().toString(16)}`, // mock contract address
      partyA,
      partyB,
      bettingEndTime,
      winnerRewardPercentage,
      status,
      undefined, // no winner yet
      creator,
      scenario.topic,
      scenario.description
    );
  }

  static createContractEventData(
    scenarioId: string,
    options: {
      contractId?: string;
      bettingEndTime?: number;
      creator?: string;
      blockNumber?: number;
    } = {}
  ): ContractEventData | null {
    const scenario = this.getScenario(scenarioId);
    if (!scenario) {
      return null;
    }

    const contractId = options.contractId || `test_${scenarioId}_${Date.now()}`;
    const bettingEndTime = options.bettingEndTime || Math.floor((Date.now() - 3600000) / 1000);
    const creator = options.creator || '0x1234567890123456789012345678901234567890';
    const blockNumber = options.blockNumber || Math.floor(Math.random() * 1000000) + 12000000;

    return {
      contractId,
      creator,
      topic: scenario.topic,
      description: scenario.description,
      partyA: scenario.partyA.name,
      partyB: scenario.partyB.name,
      bettingEndTime,
      blockNumber,
      transactionHash: `0xtest${Date.now().toString(16)}`
    };
  }

  static createRandomContract(category?: ContractScenario['category']): Contract {
    let availableScenarios = this.SCENARIOS;
    
    if (category) {
      availableScenarios = this.getScenariosByCategory(category);
    }

    const randomScenario = availableScenarios[Math.floor(Math.random() * availableScenarios.length)];
    const contract = this.createTestContract(randomScenario.id);
    
    if (!contract) {
      throw new Error('Failed to create random test contract');
    }

    return contract;
  }

  static createMultipleContracts(
    count: number,
    options: {
      category?: ContractScenario['category'];
      status?: ContractStatus;
      timespread?: number; // milliseconds between contract creation times
    } = {}
  ): Contract[] {
    const contracts: Contract[] = [];
    const timespread = options.timespread || 0;

    for (let i = 0; i < count; i++) {
      const baseTime = Date.now() - (i * timespread);
      let scenario: ContractScenario;

      if (options.category) {
        const categoryScenarios = this.getScenariosByCategory(options.category);
        scenario = categoryScenarios[i % categoryScenarios.length];
      } else {
        scenario = this.SCENARIOS[i % this.SCENARIOS.length];
      }

      const contract = this.createTestContract(scenario.id, {
        contractId: `batch_${scenario.id}_${i}_${baseTime}`,
        bettingEndTime: new Date(baseTime - 3600000),
        status: options.status || ContractStatus.BETTING_CLOSED
      });

      if (contract) {
        contracts.push(contract);
      }
    }

    return contracts;
  }

  static getScenarioInfo(scenarioId: string): string {
    const scenario = this.getScenario(scenarioId);
    if (!scenario) {
      return 'Unknown scenario';
    }

    return `
📊 Scenario: ${scenario.name}
📝 Topic: ${scenario.topic}
📖 Description: ${scenario.description}

🔵 Party A: ${scenario.partyA.name}
   ${scenario.partyA.description}

🔴 Party B: ${scenario.partyB.name}
   ${scenario.partyB.description}

📂 Category: ${scenario.category}
🎯 Complexity: ${scenario.expectedAnalysisComplexity}
    `.trim();
  }

  static listAvailableScenarios(): string {
    return this.SCENARIOS.map((scenario, index) => 
      `${index + 1}. ${scenario.id} - ${scenario.name} (${scenario.category}, ${scenario.expectedAnalysisComplexity})`
    ).join('\n');
  }
}

// Helper function to validate scenario compatibility with test requirements
export function validateScenarioForTest(
  scenario: ContractScenario, 
  testRequirements: {
    maxComplexity?: ContractScenario['expectedAnalysisComplexity'];
    allowedCategories?: ContractScenario['category'][];
    requireRealData?: boolean;
  }
): { valid: boolean; reason?: string } {
  if (testRequirements.maxComplexity) {
    const complexityOrder = { low: 1, medium: 2, high: 3 };
    if (complexityOrder[scenario.expectedAnalysisComplexity] > complexityOrder[testRequirements.maxComplexity]) {
      return { valid: false, reason: `Scenario complexity (${scenario.expectedAnalysisComplexity}) exceeds maximum (${testRequirements.maxComplexity})` };
    }
  }

  if (testRequirements.allowedCategories && !testRequirements.allowedCategories.includes(scenario.category)) {
    return { valid: false, reason: `Scenario category (${scenario.category}) not in allowed categories` };
  }

  if (testRequirements.requireRealData && scenario.category === 'general') {
    return { valid: false, reason: 'Real data required but scenario uses test data' };
  }

  return { valid: true };
}

export default TestContractFactory;