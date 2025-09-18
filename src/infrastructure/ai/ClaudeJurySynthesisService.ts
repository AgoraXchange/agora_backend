import { Anthropic } from '@anthropic-ai/sdk';
import { DeliberationMessage } from '../../domain/valueObjects/DeliberationMessage';
import { WinnerJuryArguments, isWinnerJuryArguments } from '../../domain/valueObjects/WinnerJuryArguments';
import { logger } from '../logging/Logger';

export interface JurySynthesisInput {
  winnerId: string;
  contractId: string;
  messages: DeliberationMessage[];
  locale?: 'ko' | 'en';
  /** Optional context for prompt */
  topic?: string;
  description?: string;
  /** Optional party display names to avoid placeholders */
  partyAName?: string;
  partyBName?: string;
  /** Optional party positions/arguments for natural language reference */
  partyAPosition?: string;
  partyBPosition?: string;
}

export class ClaudeJurySynthesisService {
  private claude: Anthropic | null = null;
  private readonly model: string;
  private driver: 'local' | 'anthropic';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    
    // Auto-enable anthropic driver if API key is available (unless explicitly set to local)
    const driverEnv = process.env.JURY_SYNTHESIS_DRIVER;
    if (driverEnv === 'local') {
      this.driver = 'local';
    } else if (driverEnv === 'anthropic' || apiKey) {
      this.driver = 'anthropic';
    } else {
      this.driver = 'local';
    }
    
    if (apiKey && this.driver === 'anthropic') {
      this.claude = new Anthropic({ apiKey });
      logger.info('Claude jury synthesis enabled', { model: this.model });
    } else {
      this.claude = null;
      if (this.driver === 'anthropic') {
        logger.warn('ANTHROPIC_API_KEY not set. Falling back to local synthesis for jury arguments.');
        this.driver = 'local'; // Force fallback if no API key
      } else {
        logger.info('Using local jury synthesis (no Claude API calls)', { driver: this.driver });
      }
    }
  }

  async generate(input: JurySynthesisInput): Promise<WinnerJuryArguments> {
    const { winnerId, messages, contractId } = input;

    const supporting = messages
      .filter(m => m.messageType === 'proposal' && m.content?.winner === winnerId)
      .map(m => ({
        agent: m.agentName || m.agentId || 'unknown',
        rationale: (m.content.text || '').trim(),
        evidence: (m.content.evidence || []).map(e => (e || '').trim()).filter(Boolean)
      }))
      .filter(item => item.rationale.length > 0 || item.evidence.length > 0);

    if (supporting.length === 0) {
      const proposals = messages.filter(m => m.messageType === 'proposal');
      proposals.slice(0, 3).forEach(p => {
        supporting.push({
          agent: p.agentName || p.agentId || 'unknown',
          rationale: (p.content.text || '').trim(),
          evidence: (p.content.evidence || []).map(e => (e || '').trim()).filter(Boolean)
        });
      });
    }

    const limit = (s: string, n = 500) => (s.length > n ? s.slice(0, n) + '…' : s);
    const capped = supporting.slice(0, 12).map(s => ({
      agent: limit(s.agent, 80),
      rationale: limit(s.rationale, 600),
      evidence: s.evidence.slice(0, 4).map(e => limit(e, 300))
    }));

    // Build a natural-language winner claim from best supporting rationale
    const bestRationale = supporting
      .map(s => s.rationale)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0];
    const winnerClaim = bestRationale ? limit(bestRationale, 280) : (input.locale === 'ko'
      ? '승자 측의 주장을 요약하여 지지하십시오.'
      : 'Support the winning side with a concise claim.');

    const langCode = input.locale || 'en';
    const language = langCode === 'ko' ? 'Korean' : 'English';
    const header = `You are a careful logician. Build three distinct logical arguments that support the winner's natural-language claim using the provided evidence and context. Then derive a concise conclusion that follows inevitably from those arguments. Output strict JSON only.`;
    const ctxTopic = input.topic ? `Topic: ${limit(input.topic, 200)}` : '';
    const ctxDesc = input.description ? `Description: ${limit(input.description, 500)}` : '';

    // Build participants section with names and positions
    let partiesLine = '';
    if (input.partyAName || input.partyBName) {
      const parties = [input.partyAName, input.partyBName].filter(Boolean).map(n => limit(String(n), 120));
      partiesLine = `Participants: ${parties.join(' vs ')}`;

      // Add positions if available
      if (input.partyAPosition || input.partyBPosition) {
        const positions = [];
        if (input.partyAName && input.partyAPosition) {
          positions.push(`${input.partyAName}: ${limit(input.partyAPosition, 200)}`);
        }
        if (input.partyBName && input.partyBPosition) {
          positions.push(`${input.partyBName}: ${limit(input.partyBPosition, 200)}`);
        }
        if (positions.length > 0) {
          partiesLine += `\nPositions: ${positions.join(' | ')}`;
        }
      }
    }

    const contextBlock = [ctxTopic, ctxDesc, partiesLine].filter(Boolean).join('\n');

    const instructions = `
Task:
- Context:\n${contextBlock || '(no additional context provided)'}
- Winner claim to support: ${winnerClaim}
- Use only the provided rationales/evidence as sources; avoid assumptions.
- Each of Jury1/2/3 should be a single, self-contained argument supported by one or more evidence pieces.
- Conclusion must logically follow from Jury1–Jury3 without introducing new facts.
- Output language: ${language}
- When referring to participants, use their actual names and positions as provided in the context. Never use generic labels like "Party A", "Party B", "partyA", or "partyB".
- If participant positions are provided, reference their specific arguments or stances rather than abstract labels.
- Focus on the substantive content of their positions when making logical arguments.
- Output format: a single compact JSON object with keys "Jury1", "Jury2", "Jury3", "Conclusion". No markdown, no code fences, no commentary.
- Do not reference internal IDs anywhere; use natural language names and positions only.

Available supporting items:
${capped.map((s, i) => `#${i + 1} Agent=${s.agent}\nRationale=${s.rationale}\nEvidence=${s.evidence.join(' | ')}`).join('\n\n')}
`;

    if (this.claude && this.driver === 'anthropic') {
      try {
        const timeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '30000', 10);
        const aiCall = this.claude.messages.create({
          model: this.model,
          max_tokens: 1200,
          temperature: 0.2,
          system: header,
          messages: [ { role: 'user', content: instructions } ]
        });

        const resp = await Promise.race([
          aiCall,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('AI request timeout')), timeoutMs))
        ]);

        const first = resp.content?.[0];
        const text = first && (first.type === 'text') ? first.text : '';
        const parsed = this.safeParseJSON(text);
        if (isWinnerJuryArguments(parsed)) {
          logger.info('Claude jury synthesis success', { contractId, winnerId, model: this.model });
          return parsed;
        }

        logger.warn('Claude jury synthesis returned unrecognized JSON, using fallback parse', { contractId });
        return this.fallbackFromEvidence(capped, winnerClaim, input.locale, input.topic, input.description, input.partyAName, input.partyBName, input.partyAPosition, input.partyBPosition);
      } catch (error) {
        logger.warn('Claude jury synthesis failed, using local fallback', {
          contractId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return this.fallbackFromEvidence(capped, winnerClaim, input.locale, input.topic, input.description, input.partyAName, input.partyBName, input.partyAPosition, input.partyBPosition);
      }
    }

    return this.fallbackFromEvidence(capped, winnerClaim, input.locale, input.topic, input.description, input.partyAName, input.partyBName, input.partyAPosition, input.partyBPosition);
  }

  private safeParseJSON(raw: string): any {
    if (!raw) return null;
    let s = raw.trim();
    if (s.startsWith('```')) {
      s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    try { return JSON.parse(s); } catch {}
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const inner = s.slice(first, last + 1);
      try { return JSON.parse(inner); } catch {}
    }
    return null;
  }

  /**
   * Map a partyId to a logical label. Heuristics:
   * - IDs ending with ":1" (or containing it) map to partyA; ":2" to partyB
   * - Fallback to last digit 1/2; default to partyA when unknown
   */
  private toPartyLabel(partyId: string): 'partyA' | 'partyB' {
    const id = String(partyId || '').trim();
    if (/:1\b/.test(id)) return 'partyA';
    if (/:2\b/.test(id)) return 'partyB';
    const last = id.slice(-1);
    if (last === '1') return 'partyA';
    if (last === '2') return 'partyB';
    return 'partyA';
  }

  private toPartyDisplayName(
    label: 'partyA' | 'partyB',
    partyAName?: string,
    partyBName?: string
  ): string {
    return label === 'partyA' ? (partyAName?.trim() || 'Party A') : (partyBName?.trim() || 'Party B');
  }

  private fallbackFromEvidence(
    items: Array<{ agent: string; rationale: string; evidence: string[] }>,
    winnerClaim: string,
    locale: 'ko' | 'en' = 'en',
    topic?: string,
    description?: string,
    partyAName?: string,
    partyBName?: string,
    partyAPosition?: string,
    partyBPosition?: string
  ): WinnerJuryArguments {
    const text = (s: string) => s.replace(/\s+/g, ' ').trim();

    // Build contextual references using natural language
    const buildContextualRef = () => {
      const parts = [];
      if (topic) parts.push(topic);
      if (partyAName && partyAPosition) {
        parts.push(`${partyAName}: ${partyAPosition}`);
      }
      if (partyBName && partyBPosition) {
        parts.push(`${partyBName}: ${partyBPosition}`);
      }
      return parts.length > 0 ? parts.join(' | ') : '';
    };

    const contextualRef = buildContextualRef();

    const arg = (i: number) => {
      const it = items[i % items.length];
      const ev = it?.evidence?.[0] || it?.rationale || '';
      const rationale = text(it?.rationale || (locale === 'en' ? 'Supportive rationale' : '지지 논거'));

      // Enhance with contextual information if available
      const contextNote = contextualRef && i === 0 ?
        (locale === 'en' ? ` considering ${contextualRef}` : ` ${contextualRef}을 고려할 때`) : '';

      return locale === 'en'
        ? `Argument ${i + 1}: ${rationale}${contextNote} (evidence: ${text(ev)})`
        : `주장 ${i + 1}: ${rationale}${contextNote} (근거: ${text(ev)})`;
    };

    const concl = () => {
      const ctxVals = [topic, description].filter((v): v is string => !!v);

      // Include participant positions in context
      if (partyAName && partyAPosition) {
        ctxVals.push(`${partyAName}: ${partyAPosition}`);
      }
      if (partyBName && partyBPosition) {
        ctxVals.push(`${partyBName}: ${partyBPosition}`);
      }

      const ctx = ctxVals.map(text);
      const ctxLine = ctx.length > 0 ? (locale === 'en' ? `Context: ${ctx.join(' | ')}` : `맥락: ${ctx.join(' | ')}`) : '';
      const base = locale === 'en'
        ? `Given the above arguments and evidence, the winner's claim is best supported: ${text(winnerClaim)}`
        : `위의 주장과 근거에 비추어 볼 때, 승자의 주장이 가장 타당합니다: ${text(winnerClaim)}`;
      return ctxLine ? `${ctxLine} ${base}` : base;
    };
    const conclusion = concl();

    return {
      Jury1: arg(0),
      Jury2: arg(1),
      Jury3: arg(2),
      Conclusion: conclusion
    };
  }
}
