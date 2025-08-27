import { JurorId } from './JurorOpinion';

export type ArgumentType = 'support' | 'challenge' | 'question' | 'clarification' | 'response' | 'concession';

export class JuryDiscussion {
  constructor(
    public readonly id: string,
    public readonly speakerId: JurorId,
    public readonly speakerName: string,
    public readonly statement: string,              // 발언 내용
    public readonly addressingJuror?: JurorId,      // 특정 배심원에게 하는 말
    public readonly argumentType: ArgumentType,
    public readonly referencePoint?: string,        // 참조하는 논점
    public readonly emotionalTone: 'neutral' | 'assertive' | 'questioning' | 'conciliatory',
    public readonly persuasionIntent: number,       // 설득 의도 강도 (0-1)
    public readonly timestamp: Date = new Date()
  ) {
    this.validateDiscussion();
  }

  private validateDiscussion(): void {
    if (!this.statement || this.statement.trim().length === 0) {
      throw new Error('Statement cannot be empty');
    }

    if (this.persuasionIntent < 0 || this.persuasionIntent > 1) {
      throw new Error('Persuasion intent must be between 0 and 1');
    }

    if (this.addressingJuror === this.speakerId) {
      throw new Error('Cannot address oneself in discussion');
    }
  }

  isDirectChallenge(): boolean {
    return this.argumentType === 'challenge' && !!this.addressingJuror;
  }

  isQuestion(): boolean {
    return this.argumentType === 'question';
  }

  isResponse(): boolean {
    return this.argumentType === 'response';
  }

  isConcession(): boolean {
    return this.argumentType === 'concession';
  }

  getFormattedStatement(): string {
    let prefix = '';
    
    if (this.addressingJuror) {
      const jurorNames: Record<JurorId, string> = {
        'gpt5': 'GPT-5',
        'claude': 'Claude',
        'gemini': 'Gemini'
      };
      prefix = `@${jurorNames[this.addressingJuror]}: `;
    }

    let typeIndicator = '';
    switch (this.argumentType) {
      case 'question':
        typeIndicator = '[질문] ';
        break;
      case 'challenge':
        typeIndicator = '[반박] ';
        break;
      case 'response':
        typeIndicator = '[답변] ';
        break;
      case 'clarification':
        typeIndicator = '[설명] ';
        break;
      case 'concession':
        typeIndicator = '[양보] ';
        break;
      case 'support':
      default:
        typeIndicator = '';
    }

    return `${this.speakerName}: ${typeIndicator}${prefix}${this.statement}`;
  }

  toJSON(): object {
    return {
      id: this.id,
      speakerId: this.speakerId,
      speakerName: this.speakerName,
      statement: this.statement,
      addressingJuror: this.addressingJuror,
      argumentType: this.argumentType,
      referencePoint: this.referencePoint,
      emotionalTone: this.emotionalTone,
      persuasionIntent: this.persuasionIntent,
      timestamp: this.timestamp,
      formattedStatement: this.getFormattedStatement()
    };
  }
}