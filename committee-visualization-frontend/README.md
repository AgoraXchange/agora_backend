# Committee Deliberation Visualization Frontend

A React TypeScript application that provides real-time visualization of AI agent committee deliberations. This frontend connects to the Agora Oracle backend to display the MoA (Mixture-of-Agents) + LLM-as-Judge decision-making process as an interactive chat interface.

## Features

### 🎯 Real-time Chat Interface
- Chat-like visualization inspired by group messaging apps
- Each AI agent appears as a character with unique avatar and personality
- Live message streaming during deliberation phases
- Typing indicators and agent status updates

### 🤖 Agent Visualization
- **GPT-4**: Analytical reasoning (Purple avatar)
- **Claude**: Thoughtful analysis (Blue avatar)  
- **Gemini**: Creative problem-solving (Green avatar)
- **Judge AI**: Impartial evaluation (Amber avatar)
- **Synthesizer**: Consensus building (Red avatar)

### 📊 Comprehensive Analytics
- **Voting Display**: Real-time vote counting and distribution
- **Progress Tracking**: Phase-by-phase deliberation progress
- **Consensus Indicators**: Strength of agreement visualization
- **Cost Breakdown**: Token usage and API costs
- **Performance Metrics**: Processing times and efficiency

### 🎮 Interactive Controls
- **Test Scenarios**: Pre-built contract examples (Sports, Politics, Markets)
- **Custom Contracts**: Input your own contract IDs
- **Committee Configuration**: Adjust deliberation parameters
- **Real-time Streaming**: SSE connection with auto-reconnect

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling
- **Framer Motion** for animations
- **Chart.js** for data visualization
- **Axios** for API communication
- **EventSource** for SSE streaming

## Setup Instructions

### Prerequisites

1. **Backend Running**: Ensure the Agora Oracle backend is running on `http://localhost:3000`
2. **Node.js**: Version 18+ recommended
3. **npm** or **yarn** package manager

### Installation

1. **Navigate to the frontend directory**:
   ```bash
   cd committee-visualization-frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   # Copy the environment template
   cp .env.example .env.local
   
   # Edit .env.local if needed (default values should work for local development)
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Open in browser**:
   ```
   http://localhost:5173
   ```

## Testing the End-to-End Flow

### Quick Start Test

1. **Launch Both Servers**:
   ```bash
   # Terminal 1 - Backend
   cd /path/to/agora_backend
   npm run dev
   
   # Terminal 2 - Frontend  
   cd /path/to/agora_backend/committee-visualization-frontend
   npm run dev
   ```

2. **Access the Frontend**:
   - Open `http://localhost:5173`
   - Click "Enter Demo Mode" to authenticate

3. **Run a Test Scenario**:
   - Select the "Test Scenarios" tab
   - Choose "NBA Finals Game 7" or any other scenario
   - Click "Start Deliberation"

4. **Watch the Deliberation**:
   - **Phase 1**: Agents will appear and start "thinking"
   - **Phase 2**: Proposals appear as chat messages
   - **Phase 3**: Judge evaluations and pairwise comparisons
   - **Phase 4**: Voting with emoji reactions
   - **Phase 5**: Final consensus and winner announcement

### Advanced Testing

#### Custom Contract Testing
1. Switch to "Custom Contract" tab
2. Enter a contract ID (e.g., `test_contract_001`)
3. Adjust committee configuration if needed
4. Start deliberation

#### Configuration Testing
1. Go to "Committee Config" tab
2. Try different presets:
   - **Quick Decision**: Fast with early exit
   - **Balanced**: Standard settings
   - **Thorough Analysis**: Comprehensive deliberation
3. Customize parameters:
   - Minimum proposals: 1-10
   - Consensus threshold: 50%-100%
   - Early exit: On/Off

### Expected Behavior

#### Successful Deliberation Flow
1. **Connection**: Green dot shows "Connected"
2. **Phase Progression**: 
   - Proposing → Judging → Consensus → Complete
3. **Agent Messages**: 
   - Proposals with confidence levels
   - Judge evaluations with scores
   - Voting with emoji reactions
4. **Final Result**: 
   - Winner announcement
   - Confidence percentage
   - Detailed reasoning

#### Error Handling
- **Backend Offline**: Red connection indicator with reconnect option
- **Invalid Contract**: Error message with details
- **Network Issues**: Auto-reconnect with exponential backoff
- **Authentication**: Automatic token refresh

## API Integration

The frontend integrates with these backend endpoints:

### Oracle Endpoints
- `POST /api/oracle/contracts/{contractId}/decide-winner` - Trigger deliberation
- `GET /api/oracle/contracts/{contractId}/decision` - Get decision result

### Deliberation Endpoints  
- `GET /api/deliberations/{id}` - Get visualization data
- `GET /api/deliberations/{id}/stream` - SSE stream for real-time updates
- `GET /api/deliberations/{id}/messages` - Get paginated messages
- `GET /api/deliberations/{id}/export` - Export deliberation report

### Authentication Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/refresh` - Token refresh

## Project Structure

```
src/
├── components/           # React components
│   ├── Chat/            # Chat interface components
│   ├── ControlPanel/    # Test scenarios and controls
│   ├── VotingDisplay/   # Voting visualization
│   └── ProgressBar/     # Progress indicators
├── hooks/               # Custom React hooks
│   ├── useDeliberation.ts  # Main deliberation management
│   └── useSSE.ts          # Server-Sent Events handling
├── services/            # API and data services
│   ├── api/            # API clients
│   └── mockData/       # Test scenarios
├── types/              # TypeScript definitions
├── config/             # Configuration files
├── context/            # React contexts
└── styles/             # CSS and styling
```

## Troubleshooting

### Common Issues

#### "Connection Failed" Error
- **Solution**: Ensure backend is running on `http://localhost:3000`
- Check CORS configuration in backend
- Verify network connectivity

#### "Authentication Required" 
- **Solution**: Click "Enter Demo Mode" button
- Check if backend auth endpoints are working
- Clear browser localStorage and retry

#### Messages Not Appearing
- **Solution**: Check browser developer console for errors
- Verify SSE connection is established
- Try refreshing the page

#### Slow Performance
- **Solution**: Check if backend is processing requests
- Monitor network tab in developer tools
- Consider reducing committee configuration complexity

### Debug Mode

Enable debug mode in `.env.local`:
```env
VITE_DEBUG=true
```

This will show detailed API logs in the browser console.

## Customization

### Adding New Test Scenarios

Edit `src/services/mockData/testScenarios.ts`:

```typescript
{
  id: 'my-custom-scenario',
  name: 'My Custom Test',
  description: 'Description of the test case',
  contractId: 'custom_contract_001',
  question: 'What is the answer?',
  options: ['Option A', 'Option B'],
  category: 'custom',
  metadata: {
    customField: 'value'
  },
  expectedDuration: 45,
  difficulty: 'medium'
}
```

### Styling Customization

The app uses Tailwind CSS with custom color variables in `tailwind.config.js`:

```javascript
colors: {
  'agent-gpt4': '#7C3AED',
  'agent-claude': '#3B82F6', 
  'agent-gemini': '#10B981',
  // ... customize colors
}
```

## Performance Considerations

- **Message Limit**: Chat displays up to 1000 messages to prevent performance issues
- **Auto-reconnect**: SSE connections automatically reconnect on failure
- **Lazy Loading**: Analytics components load only when needed
- **Memoization**: React components are optimized for re-renders

## License

This project is part of the Agora Oracle system.