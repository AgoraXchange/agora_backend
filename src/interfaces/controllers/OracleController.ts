import { Request, Response } from 'express';
import { injectable } from 'inversify';
import { container } from '../../container';
import { DecideWinnerUseCase } from '../../application/useCases/DecideWinnerUseCase';

@injectable()
export class OracleController {
  async decideWinner(req: Request, res: Response): Promise<void> {
    try {
      const { contractId } = req.params;
      
      if (!contractId) {
        res.status(400).json({ 
          success: false, 
          error: 'Contract ID is required' 
        });
        return;
      }

      const decideWinnerUseCase = container.get<DecideWinnerUseCase>('DecideWinnerUseCase');
      const result = await decideWinnerUseCase.execute({ contractId });

      if (result.success) {
        res.status(200).json({
          success: true,
          data: {
            decisionId: result.decisionId,
            winnerId: result.winnerId,
            transactionHash: result.transactionHash
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