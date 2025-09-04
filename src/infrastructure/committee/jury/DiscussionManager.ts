import { injectable } from 'inversify';
import { JurorOpinion, JurorId } from '../../../domain/entities/JurorOpinion';
import { JuryDiscussion } from '../../../domain/entities/JuryDiscussion';
import { IJuror } from '../../../domain/services/IJuryService';
import { logger } from '../../logging/Logger';

@injectable()
export class DiscussionManager {
  
  async facilitateDiscussion(
    jurors: JurorOpinion[],
    round: number,
    jurorInstances: Map<JurorId, IJuror>,
    previousDiscussions?: JuryDiscussion[]
  ): Promise<JuryDiscussion[]> {
    const discussions: JuryDiscussion[] = [];
    
    logger.info(`Facilitating discussion for round ${round}`, {
      jurorCount: jurors.length,
      previousDiscussions: previousDiscussions?.length || 0
    });

    try {
      // 1. Determine speaking order (lower confidence first - uncertain jurors ask first)
      const speakingOrder = this.determineSpeakingOrder(jurors);
      
      // 2. Each juror speaks in sequence
      for (const speaker of speakingOrder) {
        const speakerInstance = jurorInstances.get(speaker.jurorId);
        if (!speakerInstance) continue;
        
        // 2.1 Main position statement
        const statement = this.createPositionStatement(speaker, round);
        discussions.push(statement);
        
        // 2.2 Interact with other jurors
        for (const listener of jurors) {
          if (listener.jurorId === speaker.jurorId) continue;
          
          const listenerInstance = jurorInstances.get(listener.jurorId);
          if (!listenerInstance) continue;
          
          // Interact when there are differences of opinion
          if (this.shouldInteract(speaker, listener)) {
            const interaction = await speakerInstance.respondToOpinion(listener, speaker);
            discussions.push(interaction);
            
            // Listener's response
            if (interaction.argumentType === 'question') {
              const answer = await listenerInstance.answerQuestion(interaction, listener);
              discussions.push(answer);
            } else if (interaction.argumentType === 'challenge') {
              const response = await listenerInstance.respondToOpinion(speaker, listener);
              discussions.push(response);
            }
          }
        }
      }
      
      // 3. Additional persuasion attempts (when disagreement remains)
      if (!this.isUnanimous(jurors) && round > 1) {
        const persuasions = await this.generatePersuasionAttempts(
          jurors, 
          jurorInstances, 
          discussions
        );
        discussions.push(...persuasions);
      }
      
      // 4. Q&A round (when there are undecided jurors)
      const undecidedJurors = jurors.filter(j => j.currentPosition === 'UNDECIDED');
      if (undecidedJurors.length > 0) {
        const questions = await this.generateQuestions(
          undecidedJurors, 
          jurors, 
          jurorInstances
        );
        discussions.push(...questions);
      }
      
      logger.info(`Discussion round ${round} completed`, {
        totalStatements: discussions.length,
        challenges: discussions.filter(d => d.argumentType === 'challenge').length,
        questions: discussions.filter(d => d.argumentType === 'question').length
      });
      
      return discussions;
      
    } catch (error) {
      logger.error('Discussion facilitation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        round
      });
      return discussions;
    }
  }
  
  private determineSpeakingOrder(jurors: JurorOpinion[]): JurorOpinion[] {
    // Sort by lower confidence first (uncertain jurors speak first)
    return [...jurors].sort((a, b) => {
      // UNDECIDED 우선
      if (a.currentPosition === 'UNDECIDED' && b.currentPosition !== 'UNDECIDED') return -1;
      if (b.currentPosition === 'UNDECIDED' && a.currentPosition !== 'UNDECIDED') return 1;
      
      // 그 다음 신뢰도 낮은 순
      return a.confidenceLevel - b.confidenceLevel;
    });
  }
  
  private createPositionStatement(speaker: JurorOpinion, round: number): JuryDiscussion {
    const statementText = speaker.toDiscussionStatement();
    
    return new JuryDiscussion(
      `statement_${speaker.jurorId}_round${round}_${Date.now()}`,
      speaker.jurorId,
      speaker.jurorName,
      statementText,
      'support',
      speaker.confidenceLevel > 0.7 ? 'assertive' : 
        speaker.currentPosition === 'UNDECIDED' ? 'questioning' : 'neutral',
      speaker.confidenceLevel
    );
  }
  
  private shouldInteract(speaker: JurorOpinion, listener: JurorOpinion): boolean {
    // Interaction conditions
    // 1. When positions differ
    if (speaker.currentPosition !== listener.currentPosition && 
        speaker.currentPosition !== 'UNDECIDED' && 
        listener.currentPosition !== 'UNDECIDED') {
      return true;
    }
    
    // 2. When either side is UNDECIDED
    if (speaker.currentPosition === 'UNDECIDED' || listener.currentPosition === 'UNDECIDED') {
      return true;
    }
    
    // 3. When confidence gap is large (even if same position)
    if (Math.abs(speaker.confidenceLevel - listener.confidenceLevel) > 0.3) {
      return true;
    }
    
    return false;
  }
  
  private isUnanimous(jurors: JurorOpinion[]): boolean {
    const positions = jurors.map(j => j.currentPosition);
    const firstPosition = positions[0];
    return firstPosition !== 'UNDECIDED' && 
           positions.every(p => p === firstPosition);
  }
  
  private async generatePersuasionAttempts(
    jurors: JurorOpinion[],
    jurorInstances: Map<JurorId, IJuror>,
    existingDiscussions: JuryDiscussion[]
  ): Promise<JuryDiscussion[]> {
    const persuasions: JuryDiscussion[] = [];
    
    // The most confident juror attempts to persuade the least confident juror
    const sortedByConfidence = [...jurors].sort((a, b) => b.confidenceLevel - a.confidenceLevel);
    const mostConfident = sortedByConfidence[0];
    const leastConfident = sortedByConfidence[sortedByConfidence.length - 1];
    
    if (mostConfident.currentPosition !== leastConfident.currentPosition && 
        mostConfident.currentPosition !== 'UNDECIDED' &&
        leastConfident.willingToChange) {
      
      const persuaderInstance = jurorInstances.get(mostConfident.jurorId);
      if (persuaderInstance) {
        const persuasion = new JuryDiscussion(
          `persuasion_${mostConfident.jurorId}_${Date.now()}`,
          mostConfident.jurorId,
          mostConfident.jurorName,
          `${leastConfident.jurorName}, please reconsider my position.
          ${mostConfident.keyArguments[0]} is clear evidence.
          The ${mostConfident.currentPosition} position is ${(mostConfident.confidenceLevel * 100).toFixed(0)}% certain.`,
          'challenge',
          'assertive',
          0.8, // 높은 설득 의도
          undefined,
          leastConfident.jurorId
        );
        
        persuasions.push(persuasion);
        
        // Response from the target
        const targetInstance = jurorInstances.get(leastConfident.jurorId);
        if (targetInstance) {
          const response = await targetInstance.considerPersuasion(persuasion, leastConfident);
          persuasions.push(response.response);
        }
      }
    }
    
    return persuasions;
  }
  
  private async generateQuestions(
    undecidedJurors: JurorOpinion[],
    allJurors: JurorOpinion[],
    jurorInstances: Map<JurorId, IJuror>
  ): Promise<JuryDiscussion[]> {
    const questions: JuryDiscussion[] = [];
    
    for (const undecided of undecidedJurors) {
      const undecidedInstance = jurorInstances.get(undecided.jurorId);
      if (!undecidedInstance) continue;
      
      // Ask the most confident juror
      const mostConfident = allJurors
        .filter(j => j.currentPosition !== 'UNDECIDED')
        .sort((a, b) => b.confidenceLevel - a.confidenceLevel)[0];
      
      if (mostConfident) {
        const question = new JuryDiscussion(
          `question_${undecided.jurorId}_${Date.now()}`,
          undecided.jurorId,
          undecided.jurorName,
          `${mostConfident.jurorName}, could you elaborate on the key rationale for the ${mostConfident.currentPosition} position?`,
          'question',
          'questioning',
          0.3,
          undefined,
          mostConfident.jurorId
        );
        
        questions.push(question);
        
        // 답변 생성
        const answerInstance = jurorInstances.get(mostConfident.jurorId);
        if (answerInstance) {
          const answer = await answerInstance.answerQuestion(question, mostConfident);
          questions.push(answer);
        }
      }
    }
    
    return questions;
  }
}
