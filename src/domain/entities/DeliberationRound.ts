import { JuryDiscussion } from './JuryDiscussion';
import { JurorOpinion, JurorId } from './JurorOpinion';

export interface VotingResult {
  voteA: JurorId[];           // A 주장에 투표한 배심원
  voteB: JurorId[];           // B 주장에 투표한 배심원
  abstain: JurorId[];         // 기권한 배심원
}

export interface RoundMetrics {
  totalStatements: number;
  challenges: number;
  questions: number;
  concessions: number;
  averageConfidence: number;
  positionChanges: number;
}

export class DeliberationRound {
  constructor(
    public readonly roundNumber: number,
    public readonly discussions: JuryDiscussion[],
    public readonly votingResult: VotingResult,
    public readonly jurorsState: JurorOpinion[],   // 라운드 종료 시 배심원 상태
    public readonly unanimous: boolean,
    public readonly roundDurationMs: number,
    public readonly timestamp: Date = new Date()
  ) {
    this.validateRound();
  }

  private validateRound(): void {
    if (this.roundNumber < 1) {
      throw new Error('Round number must be positive');
    }

    // 투표 결과 검증
    const totalVoters = 
      this.votingResult.voteA.length + 
      this.votingResult.voteB.length + 
      this.votingResult.abstain.length;
    
    if (totalVoters !== 3) {
      throw new Error('All three jurors must vote or abstain');
    }

    // 중복 투표 방지
    const allVotes = [
      ...this.votingResult.voteA,
      ...this.votingResult.voteB,
      ...this.votingResult.abstain
    ];
    const uniqueVotes = new Set(allVotes);
    if (uniqueVotes.size !== allVotes.length) {
      throw new Error('Duplicate votes detected');
    }
  }

  get winningPosition(): 'A' | 'B' | 'TIE' {
    const aVotes = this.votingResult.voteA.length;
    const bVotes = this.votingResult.voteB.length;
    
    if (aVotes > bVotes) return 'A';
    if (bVotes > aVotes) return 'B';
    return 'TIE';
  }

  get voteMargin(): number {
    return Math.abs(
      this.votingResult.voteA.length - 
      this.votingResult.voteB.length
    );
  }

  getMetrics(): RoundMetrics {
    let challenges = 0;
    let questions = 0;
    let concessions = 0;

    this.discussions.forEach(discussion => {
      switch (discussion.argumentType) {
        case 'challenge':
          challenges++;
          break;
        case 'question':
          questions++;
          break;
        case 'concession':
          concessions++;
          break;
      }
    });

    const totalConfidence = this.jurorsState.reduce(
      (sum, juror) => sum + juror.confidenceLevel, 0
    );
    const averageConfidence = totalConfidence / this.jurorsState.length;

    // 입장 변경 수 계산 (이전 라운드와 비교 필요, 여기서는 간략화)
    const positionChanges = this.jurorsState.filter(j => j.willingToChange).length;

    return {
      totalStatements: this.discussions.length,
      challenges,
      questions,
      concessions,
      averageConfidence,
      positionChanges
    };
  }

  getRoundSummary(): string {
    const metrics = this.getMetrics();
    const voteStr = `A:${this.votingResult.voteA.length} B:${this.votingResult.voteB.length} 기권:${this.votingResult.abstain.length}`;
    
    return `
    라운드 ${this.roundNumber} 요약
    =================
    투표 결과: ${voteStr}
    승세: ${this.winningPosition === 'TIE' ? '동점' : `${this.winningPosition} 주장`}
    만장일치: ${this.unanimous ? '예' : '아니오'}
    
    토론 통계:
    - 총 발언: ${metrics.totalStatements}회
    - 도전/반박: ${metrics.challenges}회
    - 질문: ${metrics.questions}회
    - 양보: ${metrics.concessions}회
    
    배심원 상태:
    - 평균 신뢰도: ${(metrics.averageConfidence * 100).toFixed(1)}%
    - 의견 변경 가능: ${metrics.positionChanges}명
    
    소요 시간: ${(this.roundDurationMs / 1000).toFixed(1)}초
    `;
  }

  toJSON(): object {
    return {
      roundNumber: this.roundNumber,
      discussions: this.discussions.map(d => d.toJSON()),
      votingResult: this.votingResult,
      jurorsState: this.jurorsState.map(j => j.toJSON()),
      unanimous: this.unanimous,
      winningPosition: this.winningPosition,
      voteMargin: this.voteMargin,
      metrics: this.getMetrics(),
      roundDurationMs: this.roundDurationMs,
      timestamp: this.timestamp
    };
  }
}