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
}

export class ClaudeJurySynthesisService {
  private claude: Anthropic | null = null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    if (apiKey) {
      this.claude = new Anthropic({ apiKey });
    } else {
      logger.warn('ANTHROPIC_API_KEY not set. Falling back to local synthesis for jury arguments.');
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
    const contextBlock = [ctxTopic, ctxDesc].filter(Boolean).join('\n');

    const instructions = `
Task:
- Context:\n${contextBlock || '(no additional context provided)'}
- Winner claim to support: ${winnerClaim}
- Use only the provided rationales/evidence as sources; avoid assumptions.
- Each of Jury1/2/3 should be a single, self-contained argument supported by one or more evidence pieces.
- Conclusion must logically follow from Jury1–Jury3 without introducing new facts.
- Output language: ${language}
- Output format: a single compact JSON object with keys "Jury1", "Jury2", "Jury3", "Conclusion". No markdown, no code fences, no commentary.

Available supporting items:
${capped.map((s, i) => `#${i + 1} Agent=${s.agent}\nRationale=${s.rationale}\nEvidence=${s.evidence.join(' | ')}`).join('\n\n')}
`;

    if (this.claude) {
      try {
        const resp = await this.claude.messages.create({
          model: this.model,
          max_tokens: 6000,
          temperature: 0.2,
          system: header,
          messages: [ { role: 'user', content: instructions } ]
        });

        const first = resp.content?.[0];
        const text = first && (first.type === 'text') ? first.text : '';
        const parsed = this.safeParseJSON(text);
        if (isWinnerJuryArguments(parsed)) {
          logger.info('Claude jury synthesis success', { contractId, winnerId, model: this.model });
          return parsed;
        }

        logger.warn('Claude jury synthesis returned unrecognized JSON, using fallback parse', { contractId });
        return this.fallbackFromEvidence(capped, winnerClaim, input.locale, input.topic, input.description);
      } catch (error) {
        logger.error('Claude jury synthesis failed, using local fallback', {
          contractId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return this.fallbackFromEvidence(capped, winnerClaim, input.locale, input.topic, input.description);
      }
    }

    return this.fallbackFromEvidence(capped, winnerClaim, input.locale, input.topic, input.description);
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

  private fallbackFromEvidence(
    items: Array<{ agent: string; rationale: string; evidence: string[] }>,
    winnerClaim: string,
    locale: 'ko' | 'en' = 'en',
    topic?: string,
    description?: string
  ): WinnerJuryArguments {
    const text = (s: string) => s.replace(/\s+/g, ' ').trim();
    const arg = (i: number) => {
      const it = items[i % items.length];
      const ev = it?.evidence?.[0] || it?.rationale || '';
      return locale === 'en'
        ? `Argument ${i + 1}: ${text(it?.rationale || 'Supportive rationale')} (evidence: ${text(ev)})`
        : `주장 ${i + 1}: ${text(it?.rationale || '지지 논거')} (근거: ${text(ev)})`;
    };
    const concl = () => {
      const ctxVals = [topic, description].filter((v): v is string => !!v);
      const ctx = ctxVals.map(text);
      const ctxLine = ctx.length > 0 ? (locale === 'en' ? `Context: ${ctx.join(' | ')}` : `맥락: ${ctx.join(' | ')}`) : '';
      const base = locale === 'en'
        ? `Given the above arguments and evidence, the winner's claim is best supported: ${text(winnerClaim)}`
        : `위의 주장과 근거에 비추어 볼 때, 승자의 주장이 가장 타당합니다: ${text(winnerClaim)}`;
      return ctxLine ? `${ctxLine} ${base}` : base;
    };
    return {
      Jury1: arg(0),
      Jury2: arg(1),
      Jury3: arg(2),
      Conclusion: concl()
    };
  }
}
