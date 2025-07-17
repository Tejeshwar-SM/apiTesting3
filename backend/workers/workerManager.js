import createSyncWorker from './syncWorker.js';
import createAnalyticsWorker from './analyticsWorker.js';

let workers = {};

const startWorkers = () => {
  try {
    console.log('Starting BullMQ workers...');
    
    workers.sync = createSyncWorker();
    workers.analytics = createAnalyticsWorker();
    
    console.log('All workers started successfully');
    return workers;
    
  } catch (error) {
    console.error('Error starting workers:', error);
    return null;
  }
};

const stopWorkers = async () => {
  try {
    console.log('Stopping workers...');
    
    if (workers.sync) await workers.sync.close();
    if (workers.analytics) await workers.analytics.close();
    
    console.log('All workers stopped');
    return true;
    
  } catch (error) {
    console.error('Error stopping workers:', error);
    return false;
  }
};

export { startWorkers, stopWorkers };