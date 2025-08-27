export enum CommentSupportingSide {
  ARGUMENT_A = 'ARGUMENT_A',
  ARGUMENT_B = 'ARGUMENT_B',
  NEUTRAL = 'NEUTRAL',
  UNKNOWN = 'UNKNOWN'
}

export class DebateComment {
  constructor(
    public readonly id: string,
    public readonly contractId: string,
    public readonly author: string,              // 작성자 주소
    public readonly content: string,             // 댓글 내용
    public readonly timestamp: Date,
    public supportingSide?: CommentSupportingSide,  // 지지 측면 (조사관이 분류)
    public readonly replyTo?: string,            // 답글인 경우 원댓글 ID
    public readonly upvotes: number = 0,         // 추천 수
    public readonly downvotes: number = 0        // 비추천 수
  ) {
    if (!content || content.trim().length === 0) {
      throw new Error('Comment content cannot be empty');
    }
  }

  get netVotes(): number {
    return this.upvotes - this.downvotes;
  }

  get engagementScore(): number {
    // 참여도 점수: 총 투표 수와 순 투표의 조합
    const totalVotes = this.upvotes + this.downvotes;
    const netVoteRatio = totalVotes > 0 ? this.netVotes / totalVotes : 0;
    return totalVotes * (0.5 + 0.5 * netVoteRatio);
  }

  setSupportingSide(side: CommentSupportingSide): void {
    this.supportingSide = side;
  }

  isReply(): boolean {
    return !!this.replyTo;
  }

  isInfluential(): boolean {
    // 영향력 있는 댓글 판단 기준
    return this.netVotes > 10 || this.engagementScore > 20;
  }

  toJSON(): object {
    return {
      id: this.id,
      contractId: this.contractId,
      author: this.author,
      content: this.content,
      timestamp: this.timestamp,
      supportingSide: this.supportingSide,
      replyTo: this.replyTo,
      upvotes: this.upvotes,
      downvotes: this.downvotes,
      netVotes: this.netVotes,
      engagementScore: this.engagementScore
    };
  }
}