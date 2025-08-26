# End-to-End Testing Instructions

## Complete Testing Flow: Oracle → Frontend

This guide provides step-by-step instructions to test the complete integration between the Oracle backend and the Visualization frontend.

### Pre-requisites Checklist

- [ ] Backend server ready to run
- [ ] Frontend dependencies installed
- [ ] Environment variables configured
- [ ] CORS configuration updated in backend

### Step 1: Start the Backend Server

```bash
# Navigate to backend directory
cd /Users/gang-yeongyeong/Documents/GitHub/agora_backend/.conductor/san-jose

# Install dependencies (if not already done)
npm install

# Start the backend server
npm run dev
```

**Expected Output:**
```
🚀 Server starting...
📊 Logger initialized (level: info)
🔗 Database: InMemory repositories initialized
⚡ Server is running on http://localhost:3000
🏥 Health check available at http://localhost:3000/health
```

**Verify Backend:**
```bash
# Test health endpoint
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"...","environment":"development"}
```

### Step 2: Start the Frontend Server

```bash
# Navigate to frontend directory  
cd /Users/gang-yeongyeong/Documents/GitHub/agora_backend/.conductor/san-jose/committee-visualization-frontend

# Install dependencies
npm install

# Start frontend development server
npm run dev
```

**Expected Output:**
```
  VITE v5.x.x ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h to show help
```

### Step 3: Access the Frontend

1. **Open Browser**: Navigate to `http://localhost:5173`

2. **Login**: Click "Enter Demo Mode" button

3. **Verify UI Elements**:
   - [ ] Header shows "Committee Deliberation Visualization"
   - [ ] Connection status shows green "Connected" dot
   - [ ] Three main panels visible: Control Panel, Chat, Voting Display
   - [ ] Control Panel has three tabs: Test Scenarios, Custom Contract, Committee Config

### Step 4: Test with Pre-built Scenario

1. **Select Test Scenario**:
   - [ ] Go to "Test Scenarios" tab
   - [ ] Select "NBA Finals Game 7" scenario
   - [ ] Verify scenario details expand when clicked

2. **Configure Committee** (Optional):
   - [ ] Switch to "Committee Config" tab
   - [ ] Try "Quick Decision" preset
   - [ ] Note the configuration summary at bottom

3. **Start Deliberation**:
   - [ ] Return to "Test Scenarios" tab with NBA scenario selected
   - [ ] Click "Start Deliberation" button
   - [ ] Button should change to "Stop Deliberation"

### Step 5: Monitor the Deliberation Process

**Phase 1 - Proposing (0-40 seconds)**:
- [ ] Progress bar shows "Proposing Phase"
- [ ] Agent avatars appear at bottom of chat
- [ ] Typing indicators show "Agent is thinking..."
- [ ] Connection status remains "Connected"

**Expected Backend Logs:**
```
info: Committee deliberation started {"contractId":"test_contract_nba_001"}
info: Generated 3 proposals from 3 agents
```

**Phase 2 - Proposal Messages**:
- [ ] Chat messages appear from different agents
- [ ] Each message shows agent avatar, name, and timestamp
- [ ] Message content includes:
  - Proposal: "Lakers" or "Celtics"
  - Confidence percentage
  - Reasoning text
  - Evidence points (truncated)

**Phase 3 - Judging (40-75 seconds)**:
- [ ] Progress bar switches to "Judging Phase"
- [ ] Judge evaluation messages appear
- [ ] Pairwise comparison messages show "A vs B: Winner wins"

**Phase 4 - Consensus (75-90 seconds)**:
- [ ] Progress bar switches to "Consensus Phase"
- [ ] Voting panel on right activates
- [ ] Individual vote cards appear showing:
  - Agent names with avatars
  - Vote choice with emoji
  - Confidence level
  - Vote strength bars

**Phase 5 - Completion**:
- [ ] Progress bar shows "Complete"
- [ ] Winner announcement with trophy emoji
- [ ] Final results summary appears at bottom
- [ ] "Analytics" button becomes active

### Step 6: Verify Real-time Features

**SSE Connection**:
- [ ] Messages appear in real-time (not all at once)
- [ ] Progress updates smoothly
- [ ] If you disconnect internet briefly, reconnection should work

**Voting Visualization**:
- [ ] Vote distribution chart updates
- [ ] Consensus strength indicator shows result quality
- [ ] Winner highlighted with crown emoji

**Analytics Panel**:
- [ ] Click "Analytics" button in header
- [ ] Three metric cards show:
  - Total cost in USD
  - Number of messages
  - Final confidence percentage

### Step 7: Test Custom Contract

1. **Custom Input**:
   - [ ] Switch to "Custom Contract" tab
   - [ ] Enter contract ID: `test_custom_001`
   - [ ] Validation shows green checkmark

2. **Start Deliberation**:
   - [ ] Click "Start Deliberation"
   - [ ] Should work similarly to test scenario

### Step 8: Test Error Conditions

**Backend Offline Test**:
1. [ ] Stop backend server (Ctrl+C)
2. [ ] Try starting new deliberation
3. [ ] Should see red "Disconnected" status
4. [ ] Error message should appear
5. [ ] Restart backend and click "Reconnect"

**Invalid Contract Test**:
1. [ ] Enter non-existent contract ID: `invalid_contract_123`
2. [ ] Start deliberation
3. [ ] Should show appropriate error message

### Step 9: Performance Verification

**Check Browser Developer Tools**:
- [ ] Network tab shows API calls to localhost:3000
- [ ] EventSource connection established
- [ ] No console errors (except expected ones during error testing)
- [ ] Memory usage stays reasonable during long deliberations

**Backend Performance**:
- [ ] Backend responds within reasonable time (< 5 seconds for startup)
- [ ] Committee deliberation completes within 2 minutes
- [ ] No memory leaks or crashes

### Expected Results Summary

**Successful End-to-End Test Completion:**

✅ **Frontend UI**: Responsive interface with real-time updates
✅ **Authentication**: Demo login works seamlessly  
✅ **API Integration**: All REST endpoints functional
✅ **Real-time Streaming**: SSE connection stable
✅ **Committee Visualization**: All deliberation phases display correctly
✅ **Agent Representation**: Each AI agent has distinct personality
✅ **Voting System**: Vote counting and consensus display accurate
✅ **Error Handling**: Graceful degradation when backend unavailable
✅ **Analytics**: Cost and performance metrics displayed
✅ **Responsive Design**: Works on different screen sizes

### Troubleshooting Quick Fixes

**Frontend won't connect:**
```bash
# Check backend CORS settings
grep -A 10 "CORS configuration" src/app.ts
```

**Messages not streaming:**
```bash
# Verify SSE endpoint
curl -N -H "Accept: text/event-stream" http://localhost:3000/api/deliberations/test_id/stream
```

**Authentication issues:**
```bash
# Clear browser storage
# In browser console:
localStorage.clear();
# Refresh page
```

### Success Criteria

The test is considered successful when:

1. **Complete Flow**: A full deliberation from start to finish completes without errors
2. **Real-time Updates**: Chat messages appear progressively, not all at once  
3. **Accurate Results**: Final winner matches expected logic from test scenario
4. **Visual Appeal**: Interface resembles the provided chat app design
5. **Stable Connection**: SSE stream remains connected throughout deliberation
6. **Error Recovery**: System recovers gracefully from network interruptions

### Next Steps After Successful Test

- [ ] Test with different committee configurations
- [ ] Try multiple concurrent deliberations
- [ ] Test with real Oracle contract data
- [ ] Performance test with longer deliberation scenarios
- [ ] User acceptance testing with stakeholders

---

**Test Completion Time**: Approximately 15-20 minutes for full suite
**Recommended Testing Frequency**: After any backend or frontend changes