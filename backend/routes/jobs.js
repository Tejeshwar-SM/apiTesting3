import express from 'express';
import queueService from '../services/queueService.js';

const router = express.Router();

router.post('/sync', async (req, res) => {
  try {
    const result = await queueService.addSyncJob();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Sync job created - check console logs',
        jobId: result.jobId
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create sync job',
        error: result.error
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating sync job',
      error: error.message
    });
  }
});

router.post('/analytics', async (req, res) => {
  try {
    const result = await queueService.addAnalyticsJob();
    
    if (result.success) {
      res.json({
        success: true,
        message: 'Analytics job created - check console logs',
        jobId: result.jobId
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to create analytics job',
        error: result.error
      });
    }
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating analytics job',
      error: error.message
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const result = await queueService.getQueueStats();
    
    res.json({
      success: true,
      data: result.stats,
      message: 'Queue statistics'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error getting queue stats',
      error: error.message
    });
  }
});

export default router;