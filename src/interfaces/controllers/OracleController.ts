import { Request, Response } from 'express';
import { injectable } from 'inversify';
import { container } from '../../container';
import { DecideWinnerUseCase } from '../../application/useCases/DecideWinnerUseCase';
import { IBlockchainService } from '../../domain/services/IBlockchainService';
import { IContractRepository } from '../../domain/repositories/IContractRepository';
import { Contract, ContractStatus } from '../../domain/entities/Contract';
import { Party } from '../../domain/entities/Party';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { DecisionCoordinator } from '../../infrastructure/coordination/DecisionCoordinator';
import { DeliberationEventEmitter } from '../../infrastructure/committee/events/DeliberationEventEmitter';
import { IWinnerArgumentsCache } from '../../domain/repositories/IWinnerArgumentsCache';
import { logger } from '../../infrastructure/logging/Logger';

@injectable()
export class OracleController {
  // In-memory idempotency guard keyed by contractId:bettingEndTime
  private static processedEndNotifications: Set<string> = new Set();
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
        // Original response shape
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
   * POST /api/oracle/contracts/:contractId/ended
   * Public endpoint called by frontend when countdown reaches zero.
   * Idempotently closes betting on-chain (status 0 -> 1) and syncs local status.
   */
  async markEnded(req: Request, res: Response): Promise<void> {
    try {
      const pathId = req.params.contractId; // numeric string expected
      const { contractId, endedAt, bettingEndTime, chainId } = req.body || {};

      // Cross-validate ids
      if (!pathId || String(contractId) !== String(pathId)) {
        res.status(400).json({ success: false, error: 'contractId in path and body must match' });
        return;
      }

      const key = `${pathId}:${bettingEndTime}`;
      if (OracleController.processedEndNotifications.has(key)) {
        res.status(200).json({ success: true, data: { contractId: pathId, idempotent: true, action: 'already_processed' } });
        return;
      }

      const blockchain = container.get<IBlockchainService>('IBlockchainService');
      const contracts = container.get<IContractRepository>('IContractRepository');
      const coordinator = container.get<DecisionCoordinator>('DecisionCoordinator');

      let onchainStatus: number | null = null;
      let onchainEnd: number | null = null;
      let onchainData: any | null = null;
      try {
        onchainData = await blockchain.getContract(String(pathId));
        onchainStatus = onchainData.status;
        onchainEnd = onchainData.bettingEndTime;
      } catch (e) {
        logger.warn('markEnded: failed to read on-chain contract, proceeding best-effort', { contractId: pathId });
      }

      // Optional sanity: ensure provided bettingEndTime matches chain if available
      if (onchainEnd && bettingEndTime && Number(onchainEnd) !== Number(bettingEndTime)) {
        logger.warn('markEnded: bettingEndTime mismatch (body vs chain)', {
          contractId: pathId,
          body: Number(bettingEndTime),
          chain: Number(onchainEnd)
        });
      }

      let txHash: string | undefined;
      try {
        if (onchainStatus === null || onchainStatus === 0) {
          logger.info('Closing betting via frontend markEnded', { contractId: pathId, endedAt, bettingEndTime, chainId });
          txHash = await blockchain.closeBetting(String(pathId));
        } else {
          logger.info('markEnded: on-chain already closed/not-open, skipping tx', { contractId: pathId, onchainStatus });
        }
      } catch (e) {
        logger.error('markEnded: closeBetting failed', { contractId: pathId, error: e instanceof Error ? e.message : String(e) });
      }

      // Seed local repo from chain if missing, then mark closed
      try {
        let local = await contracts.findById(String(pathId));
        if (!local && onchainData) {
          // Map on-chain fields to domain entity
          const partyA = new Party(`${pathId}:1`, '', onchainData.partyA || 'Party A', onchainData.partyA || 'Party A');
          const partyB = new Party(`${pathId}:2`, '', onchainData.partyB || 'Party B', onchainData.partyB || 'Party B');
          const bettingEnd = new Date((onchainData.bettingEndTime || Math.floor(Date.now()/1000)) * 1000);

          // Map status: 0 Active->BETTING_OPEN, 1 Closed->BETTING_CLOSED, 2 Resolved->DECIDED, 3 Distributed->DISTRIBUTED, 4 Cancelled->BETTING_CLOSED
          const statusMap: Record<number, ContractStatus> = {
            0: ContractStatus.BETTING_OPEN,
            1: ContractStatus.BETTING_CLOSED,
            2: ContractStatus.DECIDED,
            3: ContractStatus.DISTRIBUTED,
            4: ContractStatus.BETTING_CLOSED
          } as any;
          const mappedStatus = statusMap[Number(onchainData.status)] || ContractStatus.BETTING_OPEN;

          const contractAddress = process.env.MAIN_CONTRACT_ADDRESS || `0x${'0'.repeat(40)}`;

          local = new Contract(
            String(pathId),
            contractAddress,
            partyA,
            partyB,
            bettingEnd,
            Number(onchainData.partyRewardPercentage || 0),
            mappedStatus
          );
          await contracts.save(local);
          logger.info('markEnded: seeded contract from chain', { contractId: pathId, status: mappedStatus });
        }
        // Fallback seeding from request body when chain read failed
        if (!local && !onchainData) {
          const partyA = new Party(`${pathId}:1`, '', 'Party A', 'Party A');
          const partyB = new Party(`${pathId}:2`, '', 'Party B', 'Party B');
          const bettingEnd = new Date((Number(bettingEndTime) || Math.floor(Date.now()/1000)) * 1000);
          const contractAddress = process.env.MAIN_CONTRACT_ADDRESS || `0x${'0'.repeat(40)}`;

          local = new Contract(
            String(pathId),
            contractAddress,
            partyA,
            partyB,
            bettingEnd,
            1, // default 1% per contract constant in chain
            ContractStatus.BETTING_CLOSED
          );
          await contracts.save(local);
          logger.info('markEnded: seeded contract from request body (fallback)', { contractId: pathId });
        }
        if (local) {
          local.status = ContractStatus.BETTING_CLOSED;
          await contracts.update(local);
        }
      } catch (e) {
        logger.warn('markEnded: failed to seed/update local contract', { contractId: pathId, error: e instanceof Error ? e.message : String(e) });
      }

      OracleController.processedEndNotifications.add(key);

      // Trigger async winner decision so oracle activation doesn't depend on prior events
      try {
        // Use coordinator to avoid duplicate trigger if monitor also picks it up
        if (coordinator.tryStart(String(pathId))) {
          const decideWinnerUseCase = container.get<DecideWinnerUseCase>('DecideWinnerUseCase');
          const deliberationId = `committee_${pathId}_${Date.now()}`;
          decideWinnerUseCase.executeAsync({ contractId: String(pathId), deliberationId })
            .catch(err => {
              logger.error('markEnded: async decision trigger failed', { contractId: pathId, error: err instanceof Error ? err.message : String(err) });
            })
            .finally(() => coordinator.finish(String(pathId)));
        } else {
          logger.debug('markEnded: decision already in progress or cooling down, skipping trigger', { contractId: pathId });
        }
      } catch (e) {
        logger.warn('markEnded: could not trigger async decision', { contractId: pathId, error: e instanceof Error ? e.message : String(e) });
      }

      res.status(200).json({
        success: true,
        data: {
          contractId: pathId,
          action: onchainStatus === 0 || onchainStatus === null ? 'closed' : 'already_closed',
          idempotent: false,
          transactionHash: txHash
        }
      });
    } catch (error) {
      console.error('Controller error:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  /**
   * GET /api/oracle/contracts/:contractId/winner-arguments
   * Public endpoint to fetch structured jury arguments (Claude-based, with fallback) for a contract.
   */
  async getWinnerArguments(req: Request, res: Response): Promise<void> {
    try {
      const { contractId } = req.params;
      const lang = (req.query.lang as string) === 'ko' ? 'ko' : 'en';
      const decisionRepo = container.get<IOracleDecisionRepository>('IOracleDecisionRepository');
      const emitter = container.get<DeliberationEventEmitter>('DeliberationEventEmitter');

      const decision = await decisionRepo.findByContractId(String(contractId));
      if (!decision) {
        res.status(404).json({ success: false, error: 'Decision not found for contract' });
        return;
      }

      // Serve from cache if available
      try {
        const cache = container.get<IWinnerArgumentsCache>('IWinnerArgumentsCache');
        const cached = await cache.getByContractId(String(contractId));
        if (cached) {
          res.status(200).json({ success: true, data: cached, cached: true });
          return;
        }
      } catch {}

      // Try to use real deliberation messages first
      let messages = emitter.getMessageHistory(String(contractId));
      if (!messages || messages.length === 0) {
        // Synthesize a minimal proposal from decision metadata as seed
        const { DeliberationMessage } = await import('../../domain/valueObjects/DeliberationMessage');
        const md: any = decision.metadata || {};
        const dp: any = md.dataPoints || {};
        const all = [md.reasoning, dp.evidence].flat().filter(Boolean) as any[];
        const flatStrings = all
          .map(v => (typeof v === 'string' ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })()))
          .filter(Boolean) as string[];
        const synthetic = DeliberationMessage.createProposal(
          'jury_synthesizer',
          'Jury Synthesis Seed',
          decision.winnerId,
          md.confidence ?? 0.85,
          md.reasoning || 'Auto-generated rationale from decision metadata',
          flatStrings.slice(0, 3),
          0,
          0
        );
        messages = [synthetic];
      }

      const { ClaudeJurySynthesisService } = await import('../../infrastructure/ai/ClaudeJurySynthesisService');
      const service = new ClaudeJurySynthesisService();
      const data = await service.generate({
        winnerId: decision.winnerId,
        contractId: String(contractId),
        messages,
        locale: lang as any
      });

      // Save to cache (best-effort)
      try {
        const cache = container.get<IWinnerArgumentsCache>('IWinnerArgumentsCache');
        await cache.save(String(contractId), data);
      } catch {}

      res.status(200).json({ success: true, data, cached: false });
    } catch (error) {
      logger.error('Failed to get winner arguments', {
        contractId: req.params.contractId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
