import { Request, Response } from 'express';
import { injectable, inject } from 'inversify';
import { IOracleDecisionRepository } from '../../domain/repositories/IOracleDecisionRepository';
import { ICommitteeService } from '../../domain/services/ICommitteeService';
import { DeliberationEventEmitter } from '../../infrastructure/committee/events/DeliberationEventEmitter';
import { DeliberationVisualization } from '../../domain/valueObjects/DeliberationVisualization';
import { DeliberationMessage } from '../../domain/valueObjects/DeliberationMessage';
import { AppError } from '../../domain/errors/AppError';
import { logger } from '../../infrastructure/logging/Logger';

@injectable()
export class DeliberationVisualizationController {
  constructor(
    @inject('IOracleDecisionRepository') private decisionRepository: IOracleDecisionRepository,
    @inject('ICommitteeService') private committeeService: ICommitteeService,
    @inject('DeliberationEventEmitter') private eventEmitter: DeliberationEventEmitter
  ) {}

  /**
   * GET /api/deliberations/:id/winner-arguments
   * Builds three logical arguments (with evidence) and a conclusion supporting the final winner
   * using Anthropic's Claude model. Falls back to local synthesis when API is unavailable.
   */
  async getWinnerJuryArguments(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const lang = (req.query.lang as string) === 'ko' ? 'ko' : 'en';

      logger.info('Generating winner jury arguments', { deliberationId: id, lang });

      const decision = await this.decisionRepository.findById(id);
      if (!decision) {
        throw AppError.notFound('Deliberation decision not found');
      }
      if (decision.metadata.deliberationMode !== 'committee') {
        throw AppError.badRequest('This decision was not made by committee deliberation');
      }

      // Gather messages for this contractId
      const messages = this.eventEmitter.getMessageHistory(decision.contractId);
      if (messages.length === 0) {
        throw AppError.badRequest('No deliberation messages available in memory for this decision');
      }

      // Lazy import to avoid circular deps and to create service only when needed
      const { ClaudeJurySynthesisService } = await import('../../infrastructure/ai/ClaudeJurySynthesisService');
      const service = new ClaudeJurySynthesisService();
      const result = await service.generate({
        winnerId: decision.winnerId,
        contractId: decision.contractId,
        messages,
        locale: lang as any
      });

      res.json({ success: true, data: result });

      logger.info('Winner jury arguments generated', {
        deliberationId: id,
        winnerId: decision.winnerId
      });

    } catch (error) {
      logger.error('Failed to generate winner jury arguments', {
        deliberationId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof AppError) {
        res.status(error.statusCode).json({ success: false, error: error.message });
      } else {
        res.status(500).json({ success: false, error: 'Internal server error while generating jury arguments' });
      }
    }
  }

  /**
   * GET /api/deliberations/:id
   * Gets complete visualization data for a deliberation
   */
  async getDeliberationVisualization(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      
      logger.info('Fetching deliberation visualization', { deliberationId: id });

      // Get the oracle decision first
      const decision = await this.decisionRepository.findById(id);
      
      if (!decision) {
        throw AppError.notFound('Deliberation decision not found');
      }

      // Check if this was a committee decision
      if (!decision.metadata.deliberationMode || decision.metadata.deliberationMode !== 'committee') {
        throw AppError.badRequest('This decision was not made by committee deliberation');
      }

      const committeeDecisionId = decision.metadata.committeeDecisionId;
      if (!committeeDecisionId) {
        throw AppError.badRequest('Committee decision ID not found in metadata');
      }

      // Get stored messages from event emitter
      const messages = this.eventEmitter.getMessageHistory(decision.contractId);
      
      if (messages.length === 0) {
        // If no messages in memory, create a basic visualization from stored data
        const basicVisualization = this.createBasicVisualization(decision);
        res.json({
          success: true,
          data: {
            visualization: basicVisualization,
            messages: [],
            summary: decision.metadata
          }
        });
        return;
      }

      // Build comprehensive visualization from messages
      const visualization = this.buildVisualizationFromMessages(messages, decision);
      
      const response = {
        success: true,
        data: {
          visualization,
          messages: messages.map(m => ({
            id: m.id,
            phase: m.phase,
            messageType: m.messageType,
            agentName: m.agentName,
            summary: m.getSummary(),
            timestamp: m.metadata.timestamp,
            isCritical: m.isCritical()
          })),
          summary: {
            contractId: decision.contractId,
            finalWinner: decision.winnerId,
            confidence: decision.metadata.confidence,
            reasoning: decision.metadata.reasoning,
            totalMessages: messages.length,
            deliberationTime: this.calculateDeliberationTime(messages)
          }
        }
      };

      res.json(response);

      logger.info('Deliberation visualization sent', { 
        deliberationId: id,
        messageCount: messages.length
      });

    } catch (error) {
      logger.error('Failed to get deliberation visualization', {
        deliberationId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error while fetching deliberation data'
        });
      }
    }
  }

  /**
   * GET /api/deliberations/:id/stream
   * Streams real-time deliberation progress via Server-Sent Events
   */
  async streamDeliberation(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    
    console.log('🎯 SSE Stream Handler Called!', {
      deliberationId: id,
      url: req.url,
      timestamp: new Date().toISOString()
    });
    
    // Extract contractId from deliberationId
    // Format: committee_{contractId}_{timestamp} or just {contractId}
    let contractIdForMessages = id;
    if (id.startsWith('committee_')) {
      // Remove 'committee_' prefix
      const withoutPrefix = id.substring('committee_'.length);
      // Remove the last underscore and timestamp
      const lastUnderscoreIndex = withoutPrefix.lastIndexOf('_');
      if (lastUnderscoreIndex !== -1) {
        contractIdForMessages = withoutPrefix.substring(0, lastUnderscoreIndex);
      } else {
        contractIdForMessages = withoutPrefix;
      }
    }
    
    console.log('📊 Extracted contractId:', {
      originalId: id,
      extractedContractId: contractIdForMessages
    });
    
    logger.info('Starting deliberation stream', { 
      deliberationId: id, 
      contractId: contractIdForMessages,
      timestamp: new Date().toISOString()
    });

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // Send initial connection confirmation
    res.write(`data: ${JSON.stringify({ 
      type: 'connection', 
      message: 'Connected to deliberation stream',
      timestamp: new Date().toISOString()
    })}\n\n`);

    // Get existing messages and send them first
    const existingMessages = this.eventEmitter.getMessageHistory(contractIdForMessages);
    
    logger.info('Retrieved existing messages', {
      deliberationId: id,
      contractId: contractIdForMessages,
      messageCount: existingMessages.length
    });
    
    // Send initial message count
    res.write(`data: ${JSON.stringify({ 
      type: 'info', 
      message: `Found ${existingMessages.length} existing messages`,
      contractId: contractIdForMessages
    })}\n\n`);
    
    console.log(`📨 SSE: Sending ${existingMessages.length} buffered messages to client`);
    
    existingMessages.forEach((message, index) => {
      const streamData = {
        type: 'message',
        data: {
          id: message.id,
          phase: message.phase,
          messageType: message.messageType,
          agentName: message.agentName,
          content: message.content,
          timestamp: message.metadata.timestamp,
          summary: message.getSummary()
        }
      };
      res.write(`data: ${JSON.stringify(streamData)}\n\n`);
      
      // Log all messages for debugging
      console.log(`📤 SSE Message ${index + 1}/${existingMessages.length}:`, {
        messageType: message.messageType,
        phase: message.phase,
        agentName: message.agentName || 'system',
        summary: message.getSummary()?.substring(0, 50)
      });
    });

    // Set up listener for new messages
    const messageListener = (contractId: string, message: DeliberationMessage) => {
      console.log(`🔔 Message listener triggered:`, {
        receivedContractId: contractId,
        expectedContractId: contractIdForMessages,
        match: contractId === contractIdForMessages,
        messageType: message?.messageType
      });
      
      if (contractId === contractIdForMessages) {
        console.log(`📤 SSE: Sending real-time message #${message.id}`, {
          messageType: message.messageType,
          phase: message.phase,
          agentName: message.agentName
        });
        
        logger.debug('Streaming new message via SSE', {
          deliberationId: id,
          contractId,
          messageType: message.messageType,
          phase: message.phase
        });
        
        const streamData = {
          type: 'message',
          data: {
            id: message.id,
            phase: message.phase,
            messageType: message.messageType,
            agentName: message.agentName,
            content: message.content,
            timestamp: message.metadata.timestamp,
            summary: message.getSummary()
          }
        };
        res.write(`data: ${JSON.stringify(streamData)}\n\n`);
      }
    };

    // Set up listener for deliberation events
    const eventListener = (event: any) => {
      if (event.contractId === contractIdForMessages) {
        const streamData = {
          type: 'event',
          data: {
            eventType: event.constructor.name,
            contractId: event.contractId,
            timestamp: event.timestamp,
            ...event
          }
        };
        res.write(`data: ${JSON.stringify(streamData)}\n\n`);
      }
    };

    // Register listeners
    this.eventEmitter.on('message', messageListener);
    this.eventEmitter.on('deliberation-event', eventListener);

    // Handle client disconnect
    req.on('close', () => {
      logger.info('Deliberation stream client disconnected', { deliberationId: id });
      
      // Remove listeners
      this.eventEmitter.off('message', messageListener);
      this.eventEmitter.off('deliberation-event', eventListener);
    });

    // Send periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write(`data: ${JSON.stringify({ 
        type: 'heartbeat', 
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000); // Every 30 seconds

    // Clean up heartbeat on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
    });
  }

  /**
   * GET /api/deliberations/:id/export
   * Exports deliberation data as a comprehensive report
   */
  async exportDeliberationReport(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const format = req.query.format as string || 'json';
      
      logger.info('Exporting deliberation report', { deliberationId: id, format });

      const decision = await this.decisionRepository.findById(id);
      
      if (!decision) {
        throw AppError.notFound('Deliberation decision not found');
      }

      const messages = this.eventEmitter.getMessageHistory(decision.contractId);
      const visualization = this.buildVisualizationFromMessages(messages, decision);

      const report = {
        metadata: {
          deliberationId: id,
          contractId: decision.contractId,
          exportedAt: new Date().toISOString(),
          format
        },
        summary: visualization?.toSummary(),
        performanceMetrics: visualization?.getPerformanceMetrics(),
        timeline: visualization?.getKeyTimeline(),
        votingResults: visualization?.getVotingChartData(),
        evaluationScores: visualization?.getRadarChartData(),
        fullMessages: messages.map(m => ({
          timestamp: m.metadata.timestamp,
          phase: m.phase,
          type: m.messageType,
          agent: m.agentName,
          content: m.content,
          summary: m.getSummary()
        }))
      };

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="deliberation-${id}.csv"`);
        res.send(this.convertToCSV(report.fullMessages));
      } else {
        res.json({
          success: true,
          data: report
        });
      }

      logger.info('Deliberation report exported', { 
        deliberationId: id,
        format,
        messageCount: messages.length
      });

    } catch (error) {
      logger.error('Failed to export deliberation report', {
        deliberationId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error while exporting report'
        });
      }
    }
  }

  /**
   * GET /api/deliberations/:id/messages
   * Gets paginated messages for a deliberation
   */
  async getDeliberationMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const phase = req.query.phase as string;
      const agentId = req.query.agentId as string;

      logger.info('Fetching deliberation messages', { 
        deliberationId: id, 
        page, 
        limit, 
        phase, 
        agentId 
      });

      const decision = await this.decisionRepository.findById(id);
      
      if (!decision) {
        throw AppError.notFound('Deliberation decision not found');
      }

      let messages = this.eventEmitter.getMessageHistory(decision.contractId);

      // Apply filters
      if (phase) {
        messages = messages.filter(m => m.phase === phase);
      }
      if (agentId) {
        messages = messages.filter(m => m.agentId === agentId);
      }

      // Pagination
      const totalCount = messages.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedMessages = messages.slice(startIndex, endIndex);

      const response = {
        success: true,
        data: {
          messages: paginatedMessages.map(m => ({
            id: m.id,
            phase: m.phase,
            messageType: m.messageType,
            agentName: m.agentName,
            content: m.content,
            summary: m.getSummary(),
            timestamp: m.metadata.timestamp,
            isCritical: m.isCritical()
          })),
          pagination: {
            currentPage: page,
            pageSize: limit,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNextPage: endIndex < totalCount,
            hasPreviousPage: page > 1
          },
          filters: {
            phase,
            agentId
          }
        }
      };

      res.json(response);

    } catch (error) {
      logger.error('Failed to get deliberation messages', {
        deliberationId: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          error: error.message
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'Internal server error while fetching messages'
        });
      }
    }
  }

  /**
   * Creates basic visualization from stored decision data when messages are not available
   */
  private createBasicVisualization(decision: any): Partial<DeliberationVisualization> {
    return {
      progress: {
        currentPhase: 'completed',
        completedSteps: ['제안 생성', '심사 완료', '합의 달성'],
        totalSteps: 3,
        percentComplete: 100
      },
      timeline: {
        events: [{
          timestamp: decision.createdAt,
          phase: 'completed',
          event: 'decision',
          description: `최종 결정: ${decision.winnerId}`,
          agentName: 'Committee'
        }],
        totalDuration: 0,
        phaseBreakdown: {}
      },
      metadata: {
        contractId: decision.contractId,
        committeeDecisionId: decision.metadata.committeeDecisionId || '',
        createdAt: decision.createdAt,
        finalWinner: decision.winnerId,
        finalConfidence: decision.metadata.confidence || 0
      }
    };
  }

  /**
   * Builds visualization from message history
   */
  private buildVisualizationFromMessages(
    messages: DeliberationMessage[], 
    decision: any
  ): Partial<DeliberationVisualization> {
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const totalDuration = lastMessage.metadata.timestamp.getTime() - firstMessage.metadata.timestamp.getTime();

    return {
      progress: {
        currentPhase: 'completed',
        completedSteps: this.extractCompletedSteps(messages),
        totalSteps: 3,
        percentComplete: 100
      },
      timeline: {
        events: messages.map(m => ({
          timestamp: m.metadata.timestamp,
          phase: m.phase,
          event: m.messageType,
          description: m.getSummary(),
          agentName: m.agentName
        })),
        totalDuration,
        phaseBreakdown: this.calculatePhaseBreakdown(messages)
      },
      metadata: {
        contractId: decision.contractId,
        committeeDecisionId: decision.metadata.committeeDecisionId || '',
        createdAt: firstMessage.metadata.timestamp,
        finalWinner: decision.winnerId,
        finalConfidence: decision.metadata.confidence || 0
      }
    };
  }

  private extractCompletedSteps(messages: DeliberationMessage[]): string[] {
    const progressMessages = messages.filter(m => m.messageType === 'progress');
    return progressMessages.map(m => m.content.progress?.step || '');
  }

  private calculatePhaseBreakdown(messages: DeliberationMessage[]): Record<string, number> {
    const phases = ['proposing', 'discussion', 'consensus'];
    const breakdown: Record<string, number> = {};

    phases.forEach(phase => {
      const phaseMessages = messages.filter(m => m.phase === phase);
      if (phaseMessages.length > 0) {
        const start = phaseMessages[0].metadata.timestamp.getTime();
        const end = phaseMessages[phaseMessages.length - 1].metadata.timestamp.getTime();
        breakdown[phase] = end - start;
      }
    });

    return breakdown;
  }

  private calculateDeliberationTime(messages: DeliberationMessage[]): number {
    if (messages.length === 0) return 0;
    const start = messages[0].metadata.timestamp.getTime();
    const end = messages[messages.length - 1].metadata.timestamp.getTime();
    return end - start;
  }

  private convertToCSV(messages: any[]): string {
    if (messages.length === 0) return '';

    const headers = ['timestamp', 'phase', 'type', 'agent', 'summary'];
    const rows = messages.map(m => [
      m.timestamp,
      m.phase,
      m.type,
      m.agent || '',
      m.summary.replace(/"/g, '""') // Escape quotes
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csvContent;
  }
}
