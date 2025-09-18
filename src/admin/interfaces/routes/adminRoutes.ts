import { Router } from 'express';

const router = Router();

// Simple health check endpoint to test if the admin routes are working
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      message: 'Admin routes are working'
    }
  });
});

// Basic dashboard stats endpoint (mock data for now)
router.get('/dashboard/stats', (req, res) => {
  res.json({
    success: true,
    data: {
      promptTemplates: { total: 5, active: 3 },
      posts: { total: 12, published: 8, draft: 4 },
      comments: { total: 45, pending: 3, approved: 42 },
      users: { total: 15, active: 12 }
    }
  });
});

export { router as adminRoutes };