import { Request, Response } from 'express';
import { injectable } from 'inversify';
import { container } from '../../container';
import { DecideWinnerUseCase } from '../../application/useCases/DecideWinnerUseCase';

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
}