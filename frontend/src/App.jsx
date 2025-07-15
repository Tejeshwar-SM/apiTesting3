import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import { productAPI } from './services/api';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const ProductLookup = () => {
    const [productIds, setProductIds] = useState('');
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleLookup = async () => {
      if (!productIds.trim()) return;
      
      try {
        setLoading(true);
        const response = await productAPI.findProductsByIds(productIds);
        setResults(response);
      } catch (error) {
        console.error('Lookup error:', error);
        setResults({ success: false, message: error.message });
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Product Lookup</h2>
        <div className="flex gap-4 mb-4">
          <input
            type="text"
            placeholder="Enter product IDs (comma separated)"
            value={productIds}
            onChange={(e) => setProductIds(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded"
          />
          <button
            onClick={handleLookup}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {results && (
          <div className="mt-4">
            {results.success ? (
              <div>
                <p className="text-green-600 mb-2">Found {results.total} products</p>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(results.data, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-red-600">{results.message}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Navigation */}
      <div className="bg-white shadow mb-6">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Product Analytics</h1>
          <div className="flex space-x-4">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-2 rounded ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('lookup')}
              className={`px-4 py-2 rounded ${
                activeTab === 'lookup'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Product Lookup
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'lookup' && <ProductLookup />}
      </div>
    </div>
  );
}

export default App;