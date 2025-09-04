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
  private readonly driver: 'local' | 'anthropic';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    this.driver = (process.env.JURY_SYNTHESIS_DRIVER as any) === 'anthropic' ? 'anthropic' : 'local';
    if (apiKey && this.driver === 'anthropic') {
      this.claude = new Anthropic({ apiKey });
    } else {
      if (!apiKey && this.driver === 'anthropic') {
        logger.warn('ANTHROPIC_API_KEY not set. Falling back to local synthesis for jury arguments.');
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
        return this.fallbackFromEvidence(capped, winnerId, input.locale);
      } catch (error) {
        logger.warn('Claude jury synthesis failed, using local fallback', {
          contractId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return this.fallbackFromEvidence(capped, winnerId, input.locale);
      }
    }

    if (this.driver !== 'anthropic') {
      // Intentionally local-only mode; avoid noisy logs
      return this.fallbackFromEvidence(capped, winnerId, input.locale);
    }
    return this.fallbackFromEvidence(capped, winnerId, input.locale);
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
    winnerId: string,
    locale: 'ko' | 'en' = 'en'
  ): WinnerJuryArguments {
    const text = (s: string) => s.replace(/\s+/g, ' ').trim();
    
    // Generate diverse arguments even with limited data
    const generateArg = (index: number) => {
      const itemIndex = Math.min(index, items.length - 1);
      const item = items[itemIndex];
      const rationale = text(item?.rationale || '');
      const evidence = item?.evidence?.[0] ? text(item.evidence[0]) : rationale;
      
      // Create different argument angles
      const angles = locale === 'en' ? [
        `Strong evidence supports this decision`,
        `Multiple factors indicate this outcome`, 
        `Comprehensive analysis confirms this result`
      ] : [
        `강력한 근거가 이 결정을 뒷받침합니다`,
        `다양한 요소가 이 결과를 나타냅니다`,
        `종합적인 분석이 이 결과를 확인해줍니다`
      ];
      
      const angle = angles[index] || angles[0];
      const prefix = locale === 'en' ? `Argument ${index + 1}` : `주장 ${index + 1}`;
      const evidenceLabel = locale === 'en' ? 'evidence' : '근거';
      
      if (rationale && rationale !== evidence) {
        return `${prefix}: ${angle} - ${rationale} (${evidenceLabel}: ${evidence})`;
      } else {
        return `${prefix}: ${angle} (${evidenceLabel}: ${rationale || 'Supporting analysis indicates this outcome'})`;
      }
    };
    
    const conclusion = locale === 'en'
      ? `Based on the comprehensive analysis above, '${winnerId}' emerges as the most supported winner.`
      : `위의 종합적인 분석을 바탕으로, '${winnerId}'가 가장 지지받는 승자로 나타납니다.`;
    
    return {
      Jury1: generateArg(0),
      Jury2: generateArg(1), 
      Jury3: generateArg(2),
      Conclusion: conclusion
    };
  }
}
