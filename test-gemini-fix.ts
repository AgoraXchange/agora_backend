import 'dotenv/config';
import { GeminiProposer } from './src/infrastructure/committee/proposers/GeminiProposer';
import { AgentAnalysisInput } from './src/domain/services/IAgentService';

async function testGeminiTruncationFix() {
  console.log('=== Testing Gemini Truncation Fix ===\n');
  
  try {
    const geminiProposer = new GeminiProposer();
    
    // Create test input
    const testInput: AgentAnalysisInput = {
      contractId: 'test_contract_123',
      partyA: {
        id: 'party_alice',
        address: '0xAlice',
        name: 'Alice Company',
        description: 'Technology provider with strong track record in delivering enterprise solutions'
      },
      partyB: {
        id: 'party_bob',
        address: '0xBob',
        name: 'Bob Corporation',
        description: 'Manufacturing company with extensive supply chain expertise'
      },
      context: {
        disputeType: 'delivery',
        amount: '100000',
        deadline: '2025-09-01'
      }
    };
    
    console.log('Testing Gemini API with simplified prompt...\n');
    
    // Generate proposals
    const proposals = await geminiProposer.generateProposals(testInput, 2);
    
    console.log(`Generated ${proposals.length} proposals:\n`);
    
    proposals.forEach((proposal, index) => {
      console.log(`Proposal ${index + 1}:`);
      console.log('  Winner:', proposal.winnerId);
      console.log('  Confidence:', proposal.confidence);
      console.log('  Rationale:', proposal.rationale.substring(0, 150) + '...');
      console.log('  Evidence:', proposal.evidence);
      console.log('  Metadata:', {
        model: proposal.metadata.model,
        tokensUsed: proposal.metadata.tokensUsed
      });
      console.log('');
    });
    
    // Check if any proposal was truncated
    const metadata = proposals[0].metadata;
    if (metadata.rawResponse) {
      const response = metadata.rawResponse.response;
      const candidate = response?.candidates?.[0];
      const finishReason = candidate?.finishReason;
      
      if (finishReason === 'MAX_TOKENS') {
        console.warn('⚠️ Response was still truncated despite increased token limit');
      } else {
        console.log('✅ Response completed successfully without truncation');
        console.log('  Finish reason:', finishReason || 'STOP');
      }
    }
    
    console.log('✅ Gemini test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
  }
}

// Run the test
testGeminiTruncationFix().then(() => process.exit(0)).catch(() => process.exit(1));