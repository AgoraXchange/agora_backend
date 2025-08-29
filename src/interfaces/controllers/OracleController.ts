import { Request, Response } from 'express';
import { injectable } from 'inversify';
import { container } from '../../container';
import { DecideWinnerUseCase } from '../../application/useCases/DecideWinnerUseCase';
import { container as di } from '../../container';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { DeliberationEventEmitter } from '../../infrastructure/committee/events/DeliberationEventEmitter';

@injectable()
export class OracleController {
  async decideWinner(req: Request, res: Response): Promise<void> {
    try {
      const { contractId } = req.params;
      const { forceCommitteeMode, committeeConfig } = req.body || {};
      
      if (!contractId) {
        res.status(400).json({ 
          success: false, 
          error: 'Contract ID is required' 
        });
        return;
      }

      const decideWinnerUseCase = container.get<DecideWinnerUseCase>('DecideWinnerUseCase');
      const result = await decideWinnerUseCase.execute({ 
        contractId,
        forceCommitteeMode,
        committeeConfig 
      });

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            decisionId: result.decisionId,
            winnerId: result.winnerId,
            transactionHash: result.transactionHash,
            deliberationId: result.committeeDecisionId || result.decisionId, // For SSE streaming
            metadata: {
              confidence: 0.85, // Default confidence for now
              reasoning: 'Committee deliberation completed successfully',
              dataPoints: [],
              timestamp: new Date()
            }
          }
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async startDeliberation(req: Request, res: Response): Promise<void> {
    try {
      const { contractId } = req.params;
      const { forceCommitteeMode, committeeConfig } = req.body || {};
      
      if (!contractId) {
        res.status(400).json({ 
          success: false, 
          error: 'Contract ID is required' 
        });
        return;
      }

      // Generate deliberation ID immediately
      const deliberationId = `committee_${contractId}_${Date.now()}`;
      
      console.log('🚀 Starting async deliberation:', { contractId, deliberationId });
      
      // Add a small delay to ensure SSE connection is established first
      setTimeout(() => {
        console.log('⏱️ Starting deliberation after delay to ensure SSE connection');
        const decideWinnerUseCase = container.get<DecideWinnerUseCase>('DecideWinnerUseCase');
        decideWinnerUseCase.executeAsync({ 
          contractId,
          deliberationId,
          forceCommitteeMode,
          committeeConfig 
        }).catch(error => {
          console.error('Async deliberation failed:', error);
        });
      }, 500); // 500ms delay to ensure SSE connection

      // Return immediately with deliberation ID
      res.status(200).json({
        success: true,
        data: {
          deliberationId,
          contractId,
          status: 'started',
          message: 'Deliberation started successfully'
        }
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getDecision(req: Request, res: Response): Promise<void> {
    try {
      const { contractId } = req.params;
      
      res.status(501).json({
        success: false,
        error: 'Not implemented yet'
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  /**
   * GET /api/oracle/contracts/:contractId/winner-arguments
   * Returns structured jury arguments JSON supporting the decided winner (committee mode).
   */
  async getWinnerArguments(req: Request, res: Response): Promise<void> {
    try {
      const { contractId } = req.params;
      const lang = (req.query.lang as string) === 'ko' ? 'ko' : 'en';

      if (!contractId) {
        res.status(400).json({ success: false, error: 'Contract ID is required' });
        return;
      }

      const decisionRepo = di.get<IOracleDecisionRepository>('IOracleDecisionRepository');
      const decision = await decisionRepo.findByContractId(contractId);
      if (!decision) {
        res.status(404).json({ success: false, error: 'Decision not found for this contract' });
        return;
      }

      const emitter = di.get<DeliberationEventEmitter>('DeliberationEventEmitter');
      let messages = emitter.getMessageHistory(contractId);
      // If no committee messages exist (e.g., single_ai mode or post-restart), synthesize a minimal evidence message
      if (!messages || messages.length === 0) {
        const { DeliberationMessage } = await import('../../domain/valueObjects/DeliberationMessage');
        const evidenceFromDecision = (() => {
          const dp = decision.metadata?.dataPoints || {};
          const vals = Object.values(dp)
            .map(v => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })()))
            .filter(Boolean) as string[];
          // Include reasoning as evidence if available
          if (decision.metadata?.reasoning) vals.unshift(decision.metadata.reasoning);
          return vals.slice(0, 3);
        })();
        const synthetic = DeliberationMessage.createProposal(
          'single_ai_oracle',
          'Single AI Oracle',
          decision.winnerId,
          decision.metadata?.confidence ?? 0.85,
          decision.metadata?.reasoning || 'Auto-generated rationale from single AI decision',
          evidenceFromDecision,
          0,
          0
        );
        messages = [synthetic];
      }

      const { ClaudeJurySynthesisService } = await import('../../infrastructure/ai/ClaudeJurySynthesisService');
      const service = new ClaudeJurySynthesisService();
      const data = await service.generate({
        winnerId: decision.winnerId,
        contractId,
        messages,
        locale: lang as any
      });

      res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Winner-arguments error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
