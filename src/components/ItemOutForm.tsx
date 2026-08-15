import React, { useState, useEffect } from 'react';
import { getItems, issueItem, getItemsOut } from '../api';
import { useToast } from '@/hooks/use-toast';

/**
 * Interface representing an item in inventory
 */
interface Item {
  id: number;
  name: string;
  description: string;
  category_id: number | null;
  quantity: number;
  low_stock_threshold: number | null;
  created_at: string;
  updated_at: string;
  category_name?: string;
}

/**
 * Interface representing an issued item row
 */
interface ItemRow {
  name: string;
  requested: string;
  received: string;
  returned: string;
}

/**
 * Props for the ItemOutForm component
 */
interface ItemOutFormProps {
  onSave: (data: {
    teamLeaderPhone: string;
    projectName: string;
    ispName: string;
    location: string;
    deployment: string;
    items: { name: string; requested: number; received: number; returned: number }[];
    releaseBy: string;
    receivedBy: string;
    approvedBy1: string;
    approvedBy2: string;
  }) => void;
  onCancel: () => void;
}

/**
 * Form component for requesting and issuing materials
 */
const ItemOutForm: React.FC<ItemOutFormProps> = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    teamLeaderPhone: '',
    projectName: '',
    ispName: '',
    location: '',
    deployment: 'Deployment',
    items: [{ name: '', requested: '', received: '', returned: '' }],
    releaseBy: '',
    receivedBy: '',
    approvedBy1: '',
    approvedBy2: '',
  });
  const [itemsList, setItemsList] = useState<Item[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const items = await getItems();
      setItemsList(items);
      if (items.length === 0) {
        toast({
          title: "Warning",
          description: "No items available. Please add new items.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load available items.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (!formData.teamLeaderPhone || !formData.projectName || !formData.ispName || !formData.location) {
      toast({
        title: "Error",
        description: "Please fill all required fields.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    const hasInvalidItem = formData.items.some(item => !item.name || (item.requested && parseInt(item.requested) < 0) || (item.received && parseInt(item.received) < 0) || (item.returned && parseInt(item.returned) < 0));
    if (hasInvalidItem) {
      toast({
        title: "Error",
        description: "Please ensure all items have valid quantities.",
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    try {
      // Process each item row individually using issueItem API
      for (const item of formData.items) {
        const selectedItem = itemsList.find(i => i.name === item.name);
        if (selectedItem && item.requested) {
          const quantity = parseInt(item.requested, 10);
          await issueItem({
            personName: formData.teamLeaderPhone, // Using team leader phone as person name
            itemId: selectedItem.id,
            quantity: quantity,
          });
        }
      }

      // Collect and send all form data to onSave for potential future storage
      onSave({
        teamLeaderPhone: formData.teamLeaderPhone,
        projectName: formData.projectName,
        ispName: formData.ispName,
        location: formData.location,
        deployment: formData.deployment,
        items: formData.items.map(item => ({
          name: item.name,
          requested: item.requested ? parseInt(item.requested) : 0,
          received: item.received ? parseInt(item.received) : 0,
          returned: item.returned ? parseInt(item.returned) : 0,
        })),
        releaseBy: formData.releaseBy,
        receivedBy: formData.receivedBy,
        approvedBy1: formData.approvedBy1,
        approvedBy2: formData.approvedBy2,
      });

      toast({
        title: "Success",
        description: "Materials request submitted successfully.",
        variant: "default",
      });
      setFormData({
        teamLeaderPhone: '',
        projectName: '',
        ispName: '',
        location: '',
        deployment: 'Deployment',
        items: [{ name: '', requested: '', received: '', returned: '' }],
        releaseBy: '',
        receivedBy: '',
        approvedBy1: '',
        approvedBy2: '',
      });
      await fetchItems(); // Refresh item list after issuance
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const addItemRow = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { name: '', requested: '', received: '', returned: '' }],
    }));
  };

  const removeItemRow = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index: number, field: string, value: string) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData(prev => ({ ...prev, items: newItems }));
  };

  if (loading) {
    return (
      <div className="py-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading available items...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md border border-gray-200 max-w-6xl mx-auto styled-container" style={{ zoom: 0.7, overflowY: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none; /* IE and Edge */
          scrollbar-width: none; /* Firefox */
        }
        .styled-container {
          position: relative;
          background: linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%);
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .styled-container::before {
          content: '';
          position: absolute;
          top: -10px;
          left: 20px;
          width: 0;
          height: 0;
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-bottom: 10px solid #f3f4f6;
          z-index: 1;
        }
        .styled-container::after {
          content: '';
          position: absolute;
          top: -8px;
          left: 21px;
          width: 0;
          height: 0;
          border-left: 9px solid transparent;
          border-right: 9px solid transparent;
          border-bottom: 9px solid #ffffff;
          z-index: 2;
        }
      `}</style>
      <div className="hide-scrollbar" style={{ maxHeight: '80vh' }}>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">REQUEST FORM FOR MATERIALS</h2>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Team Leader Phone # *</label>
            <input
              type="text"
              value={formData.teamLeaderPhone}
              onChange={(e) => setFormData({ ...formData, teamLeaderPhone: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              required
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Project Name *</label>
            <input
              type="text"
              value={formData.projectName}
              onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              required
              disabled={submitting}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">ISP Name *</label>
            <input
              type="text"
              value={formData.ispName}
              onChange={(e) => setFormData({ ...formData, ispName: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              required
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Location of Project *</label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              required
              disabled={submitting}
            />
          </div>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700">Type *</label>
          <div className="flex space-x-6 mt-2">
            <label className="flex items-center">
              <input
                type="radio"
                value="Deployment"
                checked={formData.deployment === 'Deployment'}
                onChange={(e) => setFormData({ ...formData, deployment: e.target.value })}
                className="mr-2"
                disabled={submitting}
              />
              Deployment
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="Maintenance"
                checked={formData.deployment === 'Maintenance'}
                onChange={(e) => setFormData({ ...formData, deployment: e.target.value })}
                className="mr-2"
                disabled={submitting}
              />
              Maintenance
            </label>
          </div>
        </div>
        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-3">SRL</th>
                <th className="border border-gray-300 p-3">Name of Material</th>
                <th className="border border-gray-300 p-3">Qty. Requested</th>
                <th className="border border-gray-300 p-3">Qty. Received</th>
                <th className="border border-gray-300 p-3">Qty. Returned</th>
                <th className="border border-gray-300 p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, index) => (
                <tr key={index}>
                  <td className="border border-gray-300 p-3">{index + 1}</td>
                  <td className="border border-gray-300 p-3">
                    <select
                      value={item.name}
                      onChange={(e) => updateItem(index, 'name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      disabled={submitting}
                    >
                      <option value="">Select Item</option>
                      {itemsList.map((itemOption) => (
                        <option key={itemOption.id} value={itemOption.name}>
                          {itemOption.name} (Stock: {itemOption.quantity})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border border-gray-300 p-3">
                    <input
                      type="number"
                      value={item.requested}
                      onChange={(e) => updateItem(index, 'requested', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      min="0"
                      disabled={submitting}
                    />
                  </td>
                  <td className="border border-gray-300 p-3">
                    <input
                      type="number"
                      value={item.received}
                      onChange={(e) => updateItem(index, 'received', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      min="0"
                      disabled={submitting}
                    />
                  </td>
                  <td className="border border-gray-300 p-3">
                    <input
                      type="number"
                      value={item.returned}
                      onChange={(e) => updateItem(index, 'returned', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded"
                      min="0"
                      disabled={submitting}
                    />
                  </td>
                  <td className="border border-gray-300 p-3">
                    <button
                      type="button"
                      onClick={() => removeItemRow(index)}
                      className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 disabled:bg-red-400"
                      disabled={submitting || formData.items.length <= 1}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={addItemRow}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={submitting}
          >
            Add Row
          </button>
        </div>
        <div className="mt-6 flex justify-between space-x-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Release By:</label>
            <input
              type="text"
              value={formData.releaseBy}
              onChange={(e) => setFormData({ ...formData, releaseBy: e.target.value })}
              className="w-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Received By:</label>
            <input
              type="text"
              value={formData.receivedBy}
              onChange={(e) => setFormData({ ...formData, receivedBy: e.target.value })}
              className="w-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Approved By 1:</label>
            <input
              type="text"
              value={formData.approvedBy1}
              onChange={(e) => setFormData({ ...formData, approvedBy1: e.target.value })}
              className="w-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              placeholder="Signature or Name"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Approved By 2:</label>
            <input
              type="text"
              value={formData.approvedBy2}
              onChange={(e) => setFormData({ ...formData, approvedBy2: e.target.value })}
              className="w-48 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 mt-1"
              placeholder="Signature or Name"
              disabled={submitting}
            />
          </div>
        </div>
        <div className="mt-6 flex justify-end space-x-6">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default ItemOutForm;