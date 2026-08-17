import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Tags, Grid, List, AlertTriangle, ChevronDown, ChevronRight, Package, Info, Search, X } from 'lucide-react';
import * as api from '../api';
import Modal from '../components/Modal';
import CategoryForm from '../components/CategoryForm';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import ItemForm from '../components/ItemForm';

/**
 * Interface for subcategories
 */
interface Subcategory {
  id: string;
  name: string;
  description: string | null;
  itemCount?: number;
}

/**
 * Interface for categories
 */
interface Category {
  id: string;
  name: string;
  description: string | null;
  subcategories: Subcategory[];
  itemCount?: number;
  totalItems?: number;
}

/**
 * Categories Component
 * Manages the display, creation, editing, and deletion of inventory categories with hierarchy
 */
const Categories: React.FC = () => {
  // State management
  const [categories, setCategories] = useState<Category[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [layout, setLayout] = useState<'grid' | 'list'>('list');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [itemToDelete, setItemToDelete] = useState<any | null>(null);
  const { toast } = useToast();

  // Load data on component mount
  useEffect(() => {
    loadCategories();
    loadItems();
  }, []);

  // Filter categories when search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCategories(categories);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = categories.map(category => {
      // Check main category
      const mainMatches = category.name.toLowerCase().includes(term);
      const categoryItems = getCategoryItems(category.id);
      const mainItemsMatch = categoryItems.some(item => item.name.toLowerCase().includes(term));

      // Filter subs
      const filteredSubs = category.subcategories.filter(sub => 
        sub.name.toLowerCase().includes(term) || 
        getCategoryItems(sub.id).some(item => item.name.toLowerCase().includes(term))
      );

      if (mainMatches || mainItemsMatch || filteredSubs.length > 0) {
        return {
          ...category,
          subcategories: filteredSubs
        };
      }
      return null;
    }).filter(Boolean) as Category[];

    setFilteredCategories(filtered);
    // Auto-expand matching categories and subs
    const newExpandedCats = new Set<string>();
    const newExpandedSubs = new Set<string>();
    filtered.forEach(cat => {
      newExpandedCats.add(cat.id);
      cat.subcategories.forEach(sub => newExpandedSubs.add(sub.id));
    });
    setExpandedCategories(newExpandedCats);
    setExpandedSubs(newExpandedSubs);
  }, [searchTerm, categories, items]);

  /**
   * Loads categories from the API (returns full nested hierarchy)
   */
  const loadCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data || []);
    } catch (error) {
      console.error('Error loading categories:', error);
      toast({
        title: "Error",
        description: "Failed to load categories",
        variant: "destructive",
      });
    }
  };

  /**
   * Loads items from the API
   */
  const loadItems = async () => {
    try {
      const data = await api.getItems();
      setItems(data || []);
    } catch (error) {
      console.error('Error loading items:', error);
      toast({
        title: "Error",
        description: "Failed to load items",
        variant: "destructive",
      });
    }
  };

  /**
   * Toggle expand for a category
   */
  const toggleCategoryExpand = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  /**
   * Toggle expand for a subcategory
   */
  const toggleSubExpand = (subId: string) => {
    setExpandedSubs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subId)) {
        newSet.delete(subId);
      } else {
        newSet.add(subId);
      }
      return newSet;
    });
  };

  /**
   * Toggle expand for an item
   */
  const toggleItemExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  /**
   * Get items for a specific category or subcategory
   * Backend stores category_id as a number; UI ids are strings
   */
  const getCategoryItems = (catId: string) => {
    const idNum = Number(catId);
    return items.filter(item => {
      const itemCatId = typeof item.category_id === 'string' ? Number(item.category_id) : item.category_id;
      return itemCatId === idNum;
    });
  };

  /**
   * Handles saving a new or edited category
   * ALWAYS reloads full hierarchy from backend after save
   */
  const handleSaveCategory = async (categoryData: { name: string; description: string; subcategories: Subcategory[] }) => {
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, categoryData);
        toast({
          title: "Success",
          description: `Category "${categoryData.name}" updated successfully`,
          variant: "default",
        });
      } else {
        await api.addCategory(categoryData);
        toast({
          title: "Success",
          description: `Category "${categoryData.name}" created successfully`,
          variant: "default",
        });
      }

      // Close modal
      setIsModalOpen(false);
      setEditingCategory(null);

      // RELOAD FULL NESTED HIERARCHY FROM BACKEND
      await loadCategories();
      await loadItems();
    } catch (error) {
      console.error('Error saving category:', error);
      toast({
        title: "Error",
        description: `Failed to ${editingCategory ? 'update' : 'create'} category`,
        variant: "destructive",
      });
    }
  };

  /**
   * Handles saving an item
   */
  const handleSaveItem = async (itemData: any, receiptFile: File | null = null, itemId: number | null = null) => {
    try {
      const formData = new FormData();
      formData.append('name', itemData.name);
      formData.append('description', itemData.description || '');
      formData.append('category_id', itemData.categoryId.toString());
      formData.append('quantity', itemData.quantity.toString());
      formData.append('low_stock_threshold', itemData.lowStockThreshold.toString());
      if (itemData.vendorName) formData.append('vendor_name', itemData.vendorName);
      if (itemData.unitPrice !== undefined && itemData.unitPrice !== null) {
        formData.append('unit_price', itemData.unitPrice.toString());
      }
      if (receiptFile) formData.append('receiptImage', receiptFile);
      if (itemId && itemData.updateReason) formData.append('update_reason', itemData.updateReason);

      if (itemId) {
        await api.updateItem(itemId, formData);
        toast({ title: "Success", description: 'Item updated successfully' });
      } else {
        await api.addItem(formData);
        toast({ title: "Success", description: 'Item added successfully' });
      }

      setIsItemModalOpen(false);
      setEditingItem(null);
      loadItems();
      loadCategories();
    } catch (error: any) {
      console.error('Error saving item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save item",
        variant: "destructive"
      });
    }
  };

  /**
   * Handles deleting a category
   */
  const handleDeleteCategory = async (categoryId: string) => {
    try {
      await api.deleteCategory(categoryId);
      toast({
        title: "Success",
        description: "Category deleted successfully",
        variant: "default",
      });
      await loadCategories();
      await loadItems();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      });
    }
  };

  /**
   * Handles deleting an item
   */
  const handleDeleteItem = async (itemId: string) => {
    try {
      await api.deleteItem(itemId);
      toast({
        title: "Success",
        description: "Item deleted successfully",
        variant: "default",
      });
      await loadItems();
      await loadCategories();
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({
        title: "Error",
        description: "Failed to delete item",
        variant: "destructive",
      });
    }
  };

  /**
   * Confirm delete category
   */
  const confirmDeleteCategory = async () => {
    if (categoryToDelete) {
      await handleDeleteCategory(categoryToDelete.id);
      setConfirmDelete(false);
      setCategoryToDelete(null);
    }
  };

  /**
   * Confirm delete item
   */
  const confirmDeleteItemAction = async () => {
    if (itemToDelete) {
      await handleDeleteItem(itemToDelete.id);
      setConfirmDeleteItem(false);
      setItemToDelete(null);
    }
  };

  /**
   * Get category name for item
   */
  const getItemCategoryName = (item: any) => {
    return item.category_name || 'Uncategorized';
  };

  return (
    <div className="inv-theme space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--primary)]">Inventory</p>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Categories</h1>
          <p className="text-[var(--text-secondary)] mt-1">Organize your inventory items by categories</p>
        </div>
        <div className="flex items-center space-x-4 mt-4 md:mt-0">
          <Button
            variant={layout === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLayout('grid')}
            className="flex items-center"
          >
            <Grid className="h-4 w-4 mr-2" />
            Grid
          </Button>
          <Button
            variant={layout === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLayout('list')}
            className="flex items-center"
          >
            <List className="h-4 w-4 mr-2" />
            List
          </Button>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] flex items-center"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Category
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search categories, subcategories, or items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-[var(--border-strong)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
          />
        </div>
      </div>

      {/* Categories Grid */}
      {layout === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const categoryItems = getCategoryItems(category.id);
            return (
              <div
                key={category.id}
                className="bg-[var(--surface)] rounded-xl p-6 shadow-[var(--shadow-md)] border border-[var(--border)] hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center flex-1">
                    <button
                      onClick={() => toggleCategoryExpand(category.id)}
                      className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                    >
                      {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    </button>
                    <Tags className="h-8 w-8 text-green-600 mr-3" />
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{category.name}</h3>
                      <p className="text-sm text-[var(--text-secondary)]">{category.description || 'No description'}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setEditingCategory(category);
                        setIsModalOpen(true);
                      }}
                      className="p-1 text-[var(--text-muted)] hover:text-blue-600 transition-colors"
                      aria-label="Edit category"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setCategoryToDelete(category);
                        setConfirmDelete(true);
                      }}
                      className="p-1 text-[var(--text-muted)] hover:text-red-600 transition-colors"
                      aria-label="Delete category"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="text-sm text-[var(--text-muted)] mb-4">
                  Items: {category.itemCount || 0} (Total in subs: {category.totalItems || 0}) | Grand Total: { (category.itemCount || 0) + (category.totalItems || 0) }
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-4 border-t pt-4">
                    {/* Direct Items in Main Category */}
                    {categoryItems.length > 0 && (
                      <div className="ml-6">
                        <h4 className="text-md font-medium text-[var(--text-primary)] mb-2">Direct Items</h4>
                        {categoryItems.map(item => {
                          const isItemExpanded = expandedItems.has(item.id);
                          return (
                            <div key={item.id} className="border-b py-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <button
                                    onClick={() => toggleItemExpand(item.id)}
                                    className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                                  >
                                    {isItemExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </button>
                                  <Package className="h-4 w-4 mr-2 text-blue-600" />
                                  <span>{item.name}</span>
                                </div>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setIsItemModalOpen(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-900"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setItemToDelete(item);
                                      setConfirmDeleteItem(true);
                                    }}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                              {isItemExpanded && (
                                <div className="mt-2 pl-6 text-sm text-[var(--text-secondary)]">
                                  Quantity: {item.quantity} | Description: {item.description || 'N/A'}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Subcategories */}
                    {category.subcategories.length > 0 && category.subcategories.map(sub => {
                      const isSubExpanded = expandedSubs.has(sub.id);
                      const subItems = getCategoryItems(sub.id);
                      return (
                        <div key={sub.id} className="ml-6 border-l-2 border-[var(--border)] pl-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center">
                              <button
                                onClick={() => toggleSubExpand(sub.id)}
                                className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                              >
                                {isSubExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                              </button>
                              <h4 className="text-md font-medium text-[var(--text-primary)]">{sub.name}</h4>
                            </div>
                          </div>
                          <p className="text-sm text-[var(--text-secondary)]">{sub.description || 'No description'}</p>
                          <div className="text-sm text-[var(--text-muted)] mt-1">
                            Items: {sub.itemCount || 0}
                          </div>
                          {isSubExpanded && subItems.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {subItems.map(item => {
                                const isItemExpanded = expandedItems.has(item.id);
                                return (
                                  <div key={item.id} className="border-b py-2 bg-[var(--surface)] p-2 rounded">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center">
                                        <button
                                          onClick={() => toggleItemExpand(item.id)}
                                          className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                                        >
                                          {isItemExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                        </button>
                                        <Package className="h-4 w-4 mr-2 text-blue-600" />
                                        <span>{item.name}</span>
                                      </div>
                                      <div className="flex space-x-2">
                                        <button
                                          onClick={() => {
                                            setEditingItem(item);
                                            setIsItemModalOpen(true);
                                          }}
                                          className="text-blue-600 hover:text-blue-900"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setItemToDelete(item);
                                            setConfirmDeleteItem(true);
                                          }}
                                          className="text-red-600 hover:text-red-900"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                    {isItemExpanded && (
                                      <div className="mt-2 pl-6 text-sm text-[var(--text-secondary)]">
                                        Quantity: {item.quantity} | Description: {item.description || 'N/A'}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Categories List */}
      {layout === 'list' && (
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] overflow-hidden shadow-[var(--shadow-md)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border)]">
              <thead className="bg-[var(--surface-secondary)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider w-1/2">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[var(--surface)] divide-y divide-[var(--border)]">
                {filteredCategories.map((category) => {
                  const isExpanded = expandedCategories.has(category.id);
                  const categoryItems = getCategoryItems(category.id);
                  return (
                    <React.Fragment key={category.id}>
                      <tr className="hover:bg-[var(--surface-hover)]">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <button
                              onClick={() => toggleCategoryExpand(category.id)}
                              className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                            >
                              {isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                            </button>
                            <Tags className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
                            <div className="text-sm font-medium text-[var(--text-primary)]">{category.name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-[var(--text-primary)]">{category.description || 'No description'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-[var(--text-muted)]">{category.itemCount || 0} (Total: {(category.itemCount || 0) + (category.totalItems || 0)})</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setEditingCategory(category);
                                setIsModalOpen(true);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                              aria-label="Edit category"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => {
                                setCategoryToDelete(category);
                                setConfirmDelete(true);
                              }}
                              className="text-red-600 hover:text-red-900"
                              aria-label="Delete category"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && categoryItems.length > 0 && categoryItems.map(item => {
                        const isItemExpanded = expandedItems.has(item.id);
                        return (
                          <React.Fragment key={item.id}>
                            <tr className="bg-[var(--surface-secondary)]">
                              <td className="px-6 py-4 pl-16">
                                <div className="flex items-center">
                                  <button
                                    onClick={() => toggleItemExpand(item.id)}
                                    className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                                  >
                                    {isItemExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                  </button>
                                  <Package className="h-5 w-5 text-blue-600 mr-3" />
                                  <div className="text-sm font-medium text-[var(--text-primary)]">{item.name}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-[var(--text-primary)]">{item.description || 'No description'}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-[var(--text-muted)]">{item.quantity}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setIsItemModalOpen(true);
                                    }}
                                    className="text-blue-600 hover:text-blue-900"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setItemToDelete(item);
                                      setConfirmDeleteItem(true);
                                    }}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isItemExpanded && (
                              <tr>
                                <td colSpan={4} className="bg-[var(--surface-secondary)] p-4">
                                  <div className="space-y-2 text-sm">
                                    <p><strong>Quantity:</strong> {item.quantity}</p>
                                    <p><strong>Description:</strong> {item.description || 'N/A'}</p>
                                    <p><strong>Vendor:</strong> {item.vendor_name || 'N/A'}</p>
                                    <p><strong>Unit Price:</strong> {item.unit_price ? `$${item.unit_price}` : 'N/A'}</p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {isExpanded && category.subcategories && category.subcategories.map(sub => {
                        const isSubExpanded = expandedSubs.has(sub.id);
                        const subItems = getCategoryItems(sub.id);
                        return (
                          <React.Fragment key={sub.id}>
                            <tr className="bg-[var(--surface-secondary)]">
                              <td className="px-6 py-4 pl-12">
                                <div className="flex items-center">
                                  <button
                                    onClick={() => toggleSubExpand(sub.id)}
                                    className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                                  >
                                    {isSubExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                  </button>
                                  <div className="text-sm font-medium text-[var(--text-primary)]">{sub.name}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-[var(--text-primary)]">{sub.description || 'No description'}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-[var(--text-muted)]">{sub.itemCount || 0}</div>
                              </td>
                              <td className="px-6 py-4"></td>
                            </tr>
                            {isSubExpanded && subItems.map(item => {
                              const isItemExpanded = expandedItems.has(item.id);
                              return (
                                <React.Fragment key={item.id}>
                                  <tr className="bg-[var(--surface-secondary)]">
                                    <td className="px-6 py-4 pl-24">
                                      <div className="flex items-center">
                                        <button
                                          onClick={() => toggleItemExpand(item.id)}
                                          className="mr-2 text-[var(--text-muted)] hover:text-[var(--text-body)]"
                                        >
                                          {isItemExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                                        </button>
                                        <Package className="h-5 w-5 text-blue-600 mr-3" />
                                        <div className="text-sm font-medium text-[var(--text-primary)]">{item.name}</div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="text-sm text-[var(--text-primary)]">{item.description || 'No description'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm text-[var(--text-muted)]">{item.quantity}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                      <div className="flex space-x-2">
                                        <button
                                          onClick={() => {
                                            setEditingItem(item);
                                            setIsItemModalOpen(true);
                                          }}
                                          className="text-blue-600 hover:text-blue-900"
                                        >
                                          <Edit className="h-4 w-4" />
                                        </button>
                                        <button
                                          onClick={() => {
                                            setItemToDelete(item);
                                            setConfirmDeleteItem(true);
                                          }}
                                          className="text-red-600 hover:text-red-900"
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                  {isItemExpanded && (
                                    <tr>
                                      <td colSpan={4} className="bg-[var(--surface-secondary)] p-4">
                                        <div className="space-y-2 text-sm">
                                          <p><strong>Quantity:</strong> {item.quantity}</p>
                                          <p><strong>Description:</strong> {item.description || 'N/A'}</p>
                                          <p><strong>Vendor:</strong> {item.vendor_name || 'N/A'}</p>
                                          <p><strong>Unit Price:</strong> {item.unit_price ? `$${item.unit_price}` : 'N/A'}</p>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filteredCategories.length === 0 && (
        <div className="text-center py-12">
          <Tags className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">No categories found matching your search</p>
        </div>
      )}

      {/* Add/Edit Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCategory(null);
        }}
        title={editingCategory ? 'Edit Category' : 'Add New Category'}
      >
        <CategoryForm
          category={editingCategory}
          onSave={handleSaveCategory}
          onCancel={() => {
            setIsModalOpen(false);
            setEditingCategory(null);
          }}
        />
      </Modal>

      {/* Add/Edit Item Modal */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => {
          setIsItemModalOpen(false);
          setEditingItem(null);
        }}
        title={editingItem ? 'Edit Item' : 'Add New Item'}
      >
        <ItemForm
          initialData={editingItem}
          categories={categories}
          onSave={(data, file) => handleSaveItem(data, file, editingItem?.id)}
          onCancel={() => {
            setIsItemModalOpen(false);
            setEditingItem(null);
          }}
          mode={editingItem ? 'edit' : 'add'}
        />
      </Modal>

      {/* Confirm Delete Category Modal */}
      <Modal
        isOpen={confirmDelete}
        onClose={() => {
          setConfirmDelete(false);
          setCategoryToDelete(null);
        }}
        title="Confirm Delete"
      >
        <div className="flex items-start space-x-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--text-body)]">
            Are you sure you want to delete <span className="font-medium">{categoryToDelete?.name}</span> and all its subcategories? This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setConfirmDelete(false);
              setCategoryToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirmDeleteCategory}
          >
            Delete Category
          </Button>
        </div>
      </Modal>

      {/* Confirm Delete Item Modal */}
      <Modal
        isOpen={confirmDeleteItem}
        onClose={() => {
          setConfirmDeleteItem(false);
          setItemToDelete(null);
        }}
        title="Confirm Delete Item"
      >
        <div className="flex items-start space-x-3 mb-4">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--text-body)]">
            Are you sure you want to delete <span className="font-medium">{itemToDelete?.name}</span>? This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end space-x-2 pt-4">
          <Button
            variant="outline"
            onClick={() => {
              setConfirmDeleteItem(false);
              setItemToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={confirmDeleteItemAction}
          >
            Delete Item
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default Categories;