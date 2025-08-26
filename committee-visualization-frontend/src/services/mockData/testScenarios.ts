export interface TestScenario {
  id: string;
  name: string;
  description: string;
  contractId: string;
  question: string;
  options: string[];
  category: 'sports' | 'politics' | 'market' | 'entertainment' | 'custom';
  metadata: Record<string, any>;
  expectedDuration: number; // in seconds
  difficulty: 'easy' | 'medium' | 'hard';
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'nba-finals-2024',
    name: 'NBA Finals Game 7',
    description: 'Lakers vs Celtics - Championship deciding game',
    contractId: 'test_contract_nba_001',
    question: 'Who won the NBA Finals Game 7?',
    options: ['Lakers', 'Celtics'],
    category: 'sports',
    metadata: {
      gameDate: '2024-06-18',
      venue: 'TD Garden',
      finalScore: 'Lakers 108 - Celtics 102',
      overtime: false,
      gameLength: '48 minutes'
    },
    expectedDuration: 45,
    difficulty: 'medium'
  },
  {
    id: 'presidential-election-2024',
    name: 'US Presidential Election 2024',
    description: 'Determining the winner of the presidential race',
    contractId: 'test_contract_election_001',
    question: 'Who won the 2024 US Presidential Election?',
    options: ['Democratic Candidate', 'Republican Candidate', 'Independent Candidate'],
    category: 'politics',
    metadata: {
      electionDate: '2024-11-05',
      totalVotes: '155,000,000',
      battlegroundStates: ['Pennsylvania', 'Michigan', 'Wisconsin', 'Arizona', 'Georgia'],
      turnoutRate: '67%'
    },
    expectedDuration: 90,
    difficulty: 'hard'
  },
  {
    id: 'sp500-close-prediction',
    name: 'S&P 500 Daily Close',
    description: 'Stock market prediction for daily close',
    contractId: 'test_contract_market_001',
    question: 'Did the S&P 500 close above 5000 points today?',
    options: ['Yes', 'No'],
    category: 'market',
    metadata: {
      date: '2024-12-20',
      openingPrice: '4985.50',
      actualClose: '5012.34',
      volume: '3.2B',
      marketCap: '$42.5T'
    },
    expectedDuration: 30,
    difficulty: 'easy'
  },
  {
    id: 'world-cup-final',
    name: 'FIFA World Cup Final',
    description: 'World Cup championship match result',
    contractId: 'test_contract_worldcup_001',
    question: 'Who won the FIFA World Cup Final?',
    options: ['Argentina', 'France', 'Brazil', 'England'],
    category: 'sports',
    metadata: {
      matchDate: '2024-12-18',
      venue: 'Lusail Stadium, Qatar',
      attendance: '88,966',
      finalScore: 'Argentina 3-2 France (4-2 on penalties)',
      extraTime: true
    },
    expectedDuration: 60,
    difficulty: 'medium'
  },
  {
    id: 'crypto-bitcoin-price',
    name: 'Bitcoin Price Milestone',
    description: 'Bitcoin reaching new all-time high',
    contractId: 'test_contract_crypto_001',
    question: 'Did Bitcoin reach $100,000 USD this month?',
    options: ['Yes', 'No'],
    category: 'market',
    metadata: {
      currentPrice: '$98,750',
      monthlyHigh: '$102,500',
      monthlyLow: '$89,200',
      volume24h: '$28.5B',
      marketCap: '$1.95T'
    },
    expectedDuration: 35,
    difficulty: 'easy'
  },
  {
    id: 'oscars-best-picture',
    name: 'Academy Awards Best Picture',
    description: 'Oscar winner for Best Picture category',
    contractId: 'test_contract_oscars_001',
    question: 'Which film won Best Picture at the Academy Awards?',
    options: ['Oppenheimer', 'Killers of the Flower Moon', 'Barbie', 'The Zone of Interest'],
    category: 'entertainment',
    metadata: {
      ceremonyDate: '2024-03-10',
      totalNominations: {
        'Oppenheimer': 13,
        'Killers of the Flower Moon': 10,
        'Barbie': 8,
        'The Zone of Interest': 5
      },
      venue: 'Dolby Theatre, Hollywood'
    },
    expectedDuration: 50,
    difficulty: 'medium'
  },
  {
    id: 'climate-temperature-record',
    name: 'Global Temperature Record',
    description: 'Hottest year on record determination',
    contractId: 'test_contract_climate_001',
    question: 'Was 2024 the hottest year on record globally?',
    options: ['Yes', 'No'],
    category: 'custom',
    metadata: {
      averageTemperature: '+1.52°C above pre-industrial levels',
      previousRecord: '2023: +1.48°C',
      dataSource: 'NASA GISS, NOAA',
      measurementPeriod: 'January-December 2024'
    },
    expectedDuration: 40,
    difficulty: 'medium'
  }
];

export const getScenariosByCategory = (category: TestScenario['category']): TestScenario[] => {
  return TEST_SCENARIOS.filter(scenario => scenario.category === category);
};

export const getScenarioById = (id: string): TestScenario | undefined => {
  return TEST_SCENARIOS.find(scenario => scenario.id === id);
};

export const getRandomScenario = (): TestScenario => {
  return TEST_SCENARIOS[Math.floor(Math.random() * TEST_SCENARIOS.length)];
};

export const SCENARIO_CATEGORIES = [
  { key: 'sports', label: 'Sports & Competition', icon: '⚽' },
  { key: 'politics', label: 'Politics & Elections', icon: '🗳️' },
  { key: 'market', label: 'Financial Markets', icon: '📈' },
  { key: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { key: 'custom', label: 'Other', icon: '🔬' }
] as const;