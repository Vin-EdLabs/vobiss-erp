// src/pages/assets/categories-locations/index.tsx
import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Calendar, Loader2 } from 'lucide-react';
import { assetApi } from '../../../api';

interface Item {
  id: number | string;
  name: string;
  description: string;
  created_at: string;
}

export default function CategoriesLocationsPage() {
  const [categories, setCategories] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Item[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showLocForm, setShowLocForm] = useState(false);
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editingLoc, setEditingLoc] = useState<string | null>(null);

  // Form states
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [locName, setLocName] = useState('');
  const [locDesc, setLocDesc] = useState('');

  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([assetApi.getCategories(), assetApi.getLocations()])
      .then(([cats, locs]) => {
        setCategories((cats || []).map((c: any) => ({ id: c.id, name: c.name, description: c.description || '—', created_at: c.created_at || new Date().toISOString() })));
        setLocations((locs || []).map((l: any) => ({ id: l.id, name: l.name, description: l.description || '—', created_at: l.created_at || new Date().toISOString() })));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const saveCategories = async (data: Item[]) => {
    setCategories(data);
  };
  const saveLocations = async (data: Item[]) => {
    setLocations(data);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await assetApi.createCategory({ name: catName, description: catDesc || undefined });
      setCategories([...categories, { id: created.id, name: created.name, description: created.description || '—', created_at: created.created_at }]);
      setCatName('');
      setCatDesc('');
      setShowCatForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await assetApi.createLocation({ name: locName, description: locDesc || undefined });
      setLocations([...locations, { id: created.id, name: created.name, description: created.description || '—', created_at: created.created_at }]);
      setLocName('');
      setLocDesc('');
      setShowLocForm(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditCategory = (id: string | number) => {
    const cat = categories.find(c => c.id === id);
    if (cat) {
      setCatName(cat.name);
      setCatDesc(cat.description);
      setEditingCat(id);
      setShowCatForm(true);
    }
  };

  const handleEditLocation = (id: string | number) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      setLocName(loc.name);
      setLocDesc(loc.description);
      setEditingLoc(id);
      setShowLocForm(true);
    }
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat) return;
    try {
      await assetApi.updateCategory(String(editingCat), { name: catName, description: catDesc || undefined });
      setCategories(categories.map(c => c.id === editingCat ? { ...c, name: catName, description: catDesc || '—' } : c));
      resetCatForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    try {
      await assetApi.updateLocation(String(editingLoc), { name: locName, description: locDesc || undefined });
      setLocations(locations.map(l => l.id === editingLoc ? { ...l, name: locName, description: locDesc || '—' } : l));
      resetLocForm();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCategory = async (id: string | number) => {
    if (!confirm('Delete this category?')) return;
    try {
      await assetApi.deleteCategory(String(id));
      setCategories(categories.filter(c => c.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLocation = async (id: string | number) => {
    if (!confirm('Delete this location?')) return;
    try {
      await assetApi.deleteLocation(String(id));
      setLocations(locations.filter(l => l.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const resetCatForm = () => {
    setCatName('');
    setCatDesc('');
    setShowCatForm(false);
    setEditingCat(null);
  };

  const resetLocForm = () => {
    setLocName('');
    setLocDesc('');
    setShowLocForm(false);
    setEditingLoc(null);
  };

  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const TableRow = ({ item, onEdit, onDelete }: { item: Item; onEdit: () => void; onDelete: () => void }) => (
    <tr className="hover:bg-gray-50 transition">
      <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
      <td className="px-6 py-4 text-gray-600">{item.description}</td>
      <td className="px-6 py-4 text-sm text-gray-500 flex items-center gap-2">
        <Calendar className="h-4 w-4" />
        {formatDate(item.created_at)}
      </td>
      <td className="px-6 py-4 text-right">
        <button onClick={onEdit} className="text-blue-600 hover:text-blue-800 mr-4">
          <Edit2 className="h-4 w-4" />
        </button>
        <button onClick={onDelete} className="text-red-600 hover:text-red-800">
          <Trash2 className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Categories & Locations</h1>
        <p className="text-gray-600 mb-10">Manage asset organization</p>
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* CATEGORIES TABLE */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Categories</h2>
              <button
                onClick={() => setShowCatForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Add Category
              </button>
            </div>

            {showCatForm && (
              <div className="p-6 bg-gray-50 border-b border-gray-200">
                <form onSubmit={editingCat ? handleUpdateCategory : handleAddCategory} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Category Name"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <div className="flex gap-3">
                    <button type="submit" className="px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">
                      {editingCat ? 'Update' : 'Add'} Category
                    </button>
                    <button type="button" onClick={resetCatForm} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      No categories yet
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <TableRow
                      key={cat.id}
                      item={cat}
                      onEdit={() => handleEditCategory(cat.id)}
                      onDelete={() => handleDeleteCategory(cat.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* LOCATIONS TABLE */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Locations</h2>
              <button
                onClick={() => setShowLocForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Add Location
              </button>
            </div>

            {showLocForm && (
              <div className="p-6 bg-gray-50 border-b border-gray-200">
                <form onSubmit={editingLoc ? handleUpdateLocation : handleAddLocation} className="space-y-4">
                  <input
                    type="text"
                    placeholder="Location Name"
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={locDesc}
                    onChange={(e) => setLocDesc(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <div className="flex gap-3">
                    <button type="submit" className="px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-sm font-medium">
                      {editingLoc ? 'Update' : 'Add'} Location
                    </button>
                    <button type="button" onClick={resetLocForm} className="px-5 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {locations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                      No locations yet
                    </td>
                  </tr>
                ) : (
                  locations.map((loc) => (
                    <TableRow
                      key={loc.id}
                      item={loc}
                      onEdit={() => handleEditLocation(loc.id)}
                      onDelete={() => handleDeleteLocation(loc.id)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}