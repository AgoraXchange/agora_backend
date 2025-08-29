import { Anthropic } from '@anthropic-ai/sdk';
import { DeliberationMessage } from '../../domain/valueObjects/DeliberationMessage';
import { WinnerJuryArguments, isWinnerJuryArguments } from '../../domain/valueObjects/WinnerJuryArguments';
import { logger } from '../logging/Logger';

export interface JurySynthesisInput {
  winnerId: string;
  contractId: string;
  messages: DeliberationMessage[];
  locale?: 'ko' | 'en';
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

    // 1) 수집: 승자를 지지하는 제안 메시지 추출
    const supporting = messages
      .filter(m => m.messageType === 'proposal' && m.content?.winner === winnerId)
      .map(m => ({
        agent: m.agentName || m.agentId || 'unknown',
        rationale: (m.content.text || '').trim(),
        evidence: (m.content.evidence || []).map(e => (e || '').trim()).filter(Boolean)
      }))
      .filter(item => item.rationale.length > 0 || item.evidence.length > 0);

    if (supporting.length === 0) {
      // 제안이 없으면 전체 제안에서 근거를 최소한으로 수집
      const proposals = messages.filter(m => m.messageType === 'proposal');
      proposals.slice(0, 3).forEach(p => {
        supporting.push({
          agent: p.agentName || p.agentId || 'unknown',
          rationale: (p.content.text || '').trim(),
          evidence: (p.content.evidence || []).map(e => (e || '').trim()).filter(Boolean)
        });
      });
    }

    // 안전장치: 너무 긴 텍스트 축약
    const limit = (s: string, n = 500) => (s.length > n ? s.slice(0, n) + '…' : s);
    const capped = supporting.slice(0, 12).map(s => ({
      agent: limit(s.agent, 80),
      rationale: limit(s.rationale, 600),
      evidence: s.evidence.slice(0, 4).map(e => limit(e, 300))
    }));

    // 2) 프롬프트 구성
    const langCode = input.locale || 'en';
    const language = langCode === 'ko' ? 'Korean' : 'English';
    const header = `You are a careful logician. Build three distinct logical arguments that support the chosen winner using the provided evidence. Then derive a concise conclusion that follows inevitably from those arguments. Output strict JSON only.`;
    const instructions = `
Task:
- Winner: ${winnerId}
- Use only the provided rationales/evidence as sources; avoid assumptions.
- Each of Jury1/2/3 should be a single, self-contained argument supported by one or more evidence pieces.
- Conclusion must logically follow from Jury1–Jury3 without introducing new facts.
- Output language: ${language}
- Output format: a single compact JSON object with keys "Jury1", "Jury2", "Jury3", "Conclusion". No markdown, no code fences, no commentary.

Available supporting items:
${capped.map((s, i) => `#${i + 1} Agent=${s.agent}\nRationale=${s.rationale}\nEvidence=${s.evidence.join(' | ')}`).join('\n\n')}
`;

    // 3) 모델 호출 (가능 시)
    if (this.claude) {
      try {
        const resp = await this.claude.messages.create({
          model: this.model,
          max_tokens: 6000,
          temperature: 0.2,
          system: header,
          messages: [
            { role: 'user', content: instructions }
          ]
        });

        const first = resp.content?.[0];
        const text = first && (first.type === 'text') ? first.text : '';
        const parsed = this.safeParseJSON(text);
        if (isWinnerJuryArguments(parsed)) {
          logger.info('Claude jury synthesis success', { contractId, winnerId, model: this.model });
          return parsed;
        }

        logger.warn('Claude jury synthesis returned unrecognized JSON, using fallback parse', { contractId });
        const fallbackParsed = this.fallbackFromEvidence(capped, winnerId, input.locale);
        return fallbackParsed;
      } catch (error) {
        logger.error('Claude jury synthesis failed, using local fallback', {
          contractId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return this.fallbackFromEvidence(capped, winnerId, input.locale);
      }
    }

    // 4) 모델 없을 때 로컬 폴백
    return this.fallbackFromEvidence(capped, winnerId, input.locale);
  }

  private safeParseJSON(raw: string): any {
    if (!raw) return null;
    let s = raw.trim();
    // Strip code fences if present
    if (s.startsWith('```')) {
      s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim();
    }
    // Try direct parse
    try { return JSON.parse(s); } catch {}
    // Try to extract outermost braces
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
    winnerId: string,
    locale: 'ko' | 'en' = 'en'
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
      const base = locale === 'en'
        ? `Given the above arguments and evidence, the winner '${winnerId}' is best supported.`
        : `위의 주장과 근거에 비추어 볼 때, 승자 '${winnerId}'가 가장 타당합니다.`;
      return base;
    };
    return {
      Jury1: arg(0),
      Jury2: arg(1),
      Jury3: arg(2),
      Conclusion: concl()
    };
  }
}
