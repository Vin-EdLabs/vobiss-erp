import React, { useState, useEffect } from 'react';
import { AlertTriangle, Package, TrendingDown, RefreshCw, Search, Filter, ShoppingBag, List, Grid } from 'lucide-react';
import { getItems, getCategories, getItemsOut, addItem, updateItem, deleteItem, issueItem, getLowStockItems, getDashboardStats } from '../api';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

/**
 * Interface for inventory items
 */
interface Item {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  quantity: number;
  low_stock_threshold: number;
}

/**
 * Interface for categories
 */
interface Category {
  id: string;
  name: string;
  description: string | null;
}

/**
 * LowStockAlerts Component
 * Displays items that are below or near their low stock threshold
 */
const LowStockAlerts: React.FC = () => {
  // State management
  const [lowStockItems, setLowStockItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const { toast } = useToast();

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  // Filter items when filters change
  useEffect(() => {
    filterItems();
  }, [lowStockItems, searchTerm, categoryFilter, severityFilter]);

  /**
   * Loads low stock items and categories from API
   */
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Fetch low stock items and categories
      const [items, categoriesData] = await Promise.all([
        getLowStockItems(),
        getCategories()
      ]);
      
      setLowStockItems(items || []);
      setCategories(categoriesData || []);
    } catch (error) {
      console.error('Error loading low stock data:', error);
      toast({
        title: "Error",
        description: "Failed to load low stock items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Filters items based on search term, category, and severity
   */
  const filterItems = () => {
    let filtered = [...lowStockItems];
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.description?.toLowerCase() || '').includes(searchTerm.toLowerCase())
      );
    }
    
    // Apply category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => item.category_id === categoryFilter);
    }
    
    // Apply severity filter
    if (severityFilter !== 'all') {
      switch (severityFilter) {
        case 'critical':
          // Critical: 0 or less than 50% of threshold
          filtered = filtered.filter(item => 
            item.quantity === 0 || item.quantity <= item.low_stock_threshold * 0.5
          );
          break;
        case 'warning':
          // Warning: Between 50% and 100% of threshold
          filtered = filtered.filter(item => 
            item.quantity > item.low_stock_threshold * 0.5 && item.quantity <= item.low_stock_threshold
          );
          break;
      }
    }
    
    setFilteredItems(filtered);
  };

  /**
   * Gets the name of a category by ID
   */
  const getCategoryName = (categoryId: string | null): string => {
    if (!categoryId) return 'Uncategorized';
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : 'Unknown';
  };

  /**
   * Determines stock level status based on quantity and threshold
   */
  const getStockLevel = (quantity: number, threshold: number) => {
    if (quantity <= 0) return { level: 'Out of Stock', color: 'bg-red-500', textColor: 'text-red-800', bgColor: 'bg-red-100' };
    if (quantity <= threshold * 0.5) return { level: 'Critical', color: 'bg-red-500', textColor: 'text-red-800', bgColor: 'bg-red-100' };
    if (quantity <= threshold) return { level: 'Low', color: 'bg-yellow-500', textColor: 'text-yellow-800', bgColor: 'bg-yellow-100' };
    return { level: 'Normal', color: 'bg-green-500', textColor: 'text-green-800', bgColor: 'bg-green-100' };
  };

  /**
   * Refreshes data from the database
   */
  const handleRefresh = () => {
    loadData();
    toast({
      title: "Refreshing",
      description: "Updating low stock items data",
      variant: "default"
    });
  };

  return (
    <div className="inv-theme space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Inventory</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Low Stock Alerts</h1>
          <p className="text-[var(--text-secondary)] mt-1">Items that need attention and restocking</p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--text-body)] hover:bg-[var(--surface-hover)]"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button
            variant="default"
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <ShoppingBag className="h-4 w-4 mr-2" />
            Order Supplies
          </Button>
        </div>
      </div>

      {/* Alert Summary */}
      <div className="rounded-[var(--radius-lg)] border border-transparent bg-[var(--accent-red-light)] p-5 sm:p-6">
        <div className="flex items-center">
          <AlertTriangle className="h-8 w-8 text-[var(--danger)] mr-3 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-[var(--danger-text)]">
              {lowStockItems.length} {lowStockItems.length === 1 ? 'item needs' : 'items need'} attention
            </h2>
            <p className="text-[var(--danger-text)]">
              These items are running low and may need restocking soon.
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--surface)] rounded-xl p-6 shadow-[var(--shadow-md)] border border-[var(--border)] mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          {/* Category Filter */}
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </div>
          
          {/* Severity Filter */}
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Levels</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
            </select>
          </div>
          
          {/* View Mode Toggle */}
          <div className="flex items-end">
            <div className="w-full flex items-center justify-center border border-[var(--border-strong)] rounded-lg overflow-hidden">
              <button 
                className={`flex-1 py-2 px-4 flex items-center justify-center ${viewMode === 'list' ? 'bg-blue-100 text-blue-800' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}
                onClick={() => setViewMode('list')}
              >
                <List className="h-5 w-5" />
              </button>
              <button 
                className={`flex-1 py-2 px-4 flex items-center justify-center ${viewMode === 'grid' ? 'bg-blue-100 text-blue-800' : 'bg-[var(--surface)] text-[var(--text-secondary)]'}`}
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-[var(--text-secondary)]">Loading low stock items...</p>
        </div>
      )}

      {/* Low Stock Items - List View */}
      {!loading && viewMode === 'list' && (
        <div className="space-y-4">
          {filteredItems.map(item => {
            const stockLevel = getStockLevel(item.quantity, item.low_stock_threshold);
            
            return (
              <div key={item.id} className="bg-[var(--surface)] rounded-xl p-6 shadow-[var(--shadow-md)] border border-[var(--border)] hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row md:items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`p-3 rounded-lg ${stockLevel.bgColor}`}>
                      <Package className={`h-6 w-6 ${stockLevel.textColor}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{item.name}</h3>
                      <p className="text-sm text-[var(--text-secondary)]">{getCategoryName(item.category_id)}</p>
                      <p className="text-sm text-[var(--text-muted)] mt-1">{item.description || 'No description available'}</p>
                    </div>
                  </div>
                  
                  <div className="text-right mt-4 md:mt-0">
                    <div className="flex items-center space-x-3 mb-2 justify-end">
                      <div className={`w-3 h-3 rounded-full ${stockLevel.color}`}></div>
                      <span className={`text-sm font-medium ${stockLevel.textColor}`}>{stockLevel.level}</span>
                    </div>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-2xl font-bold text-[var(--text-primary)]">{item.quantity}</span>
                      <span className="text-sm text-[var(--text-muted)]">/ {item.low_stock_threshold}</span>
                    </div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${stockLevel.color}`}
                      style={{ 
                        width: `${Math.min(100, (item.quantity / item.low_stock_threshold) * 100)}%` 
                      }}
                    ></div>
                  </div>
                  <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1">
                    <span>0</span>
                    <span>{item.low_stock_threshold}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Low Stock Items - Grid View */}
      {!loading && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => {
            const stockLevel = getStockLevel(item.quantity, item.low_stock_threshold);
            
            return (
              <div key={item.id} className="bg-[var(--surface)] rounded-xl p-6 shadow-[var(--shadow-md)] border border-[var(--border)] hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-lg ${stockLevel.bgColor}`}>
                    <Package className={`h-5 w-5 ${stockLevel.textColor}`} />
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${stockLevel.color}`}></div>
                    <span className={`text-xs font-medium ${stockLevel.textColor}`}>{stockLevel.level}</span>
                  </div>
                </div>
                
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{item.name}</h3>
                <p className="text-xs text-[var(--text-secondary)] mb-2">{getCategoryName(item.category_id)}</p>
                
                <div className="flex items-baseline space-x-2 mb-3">
                  <span className="text-2xl font-bold text-[var(--text-primary)]">{item.quantity}</span>
                  <span className="text-sm text-[var(--text-muted)]">/ {item.low_stock_threshold}</span>
                </div>
                
                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                  <div
                    className={`h-2 rounded-full ${stockLevel.color}`}
                    style={{ 
                      width: `${Math.min(100, (item.quantity / item.low_stock_threshold) * 100)}%` 
                    }}
                  ></div>
                </div>
                
                <p className="text-xs text-[var(--text-muted)] line-clamp-2 mt-2">
                  {item.description || 'No description available'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredItems.length === 0 && (
        <div className="text-center py-12 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm">
          <TrendingDown className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-[var(--text-primary)] mb-2">All items are well stocked!</h3>
          <p className="text-[var(--text-secondary)] max-w-md mx-auto">
            {searchTerm || categoryFilter !== 'all' || severityFilter !== 'all' 
              ? 'No items match your current filters. Try adjusting your search criteria.'
              : 'No items are currently below their low stock threshold.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default LowStockAlerts;