import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Package, Image, Edit } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

interface Subcategory {
  id: number;
  name: string;
}

interface Category {
  id: number;
  name: string;
  subcategories: Subcategory[];
}

interface ItemFormProps {
  initialData?: {
    name: string;
    description: string;
    categoryId: number;
    quantity: number;
    lowStockThreshold: number;
    vendorName?: string;
    unitPrice?: number;
    updateReason?: string;
  };
  categories: Category[];
  onSave: (data: {
    name: string;
    description: string;
    categoryId: string;
    quantity: number;
    lowStockThreshold: number;
    vendorName?: string;
    unitPrice?: number;
    updateReason?: string;
  }, receiptFile?: File | null) => Promise<void>;
  onCancel: () => void;
  mode: 'add' | 'edit';
  isInline?: boolean;
}

const ItemForm: React.FC<ItemFormProps> = ({
  initialData,
  categories,
  onSave,
  onCancel,
  mode,
  isInline = false,
}) => {
  const { toast } = useToast();
  const isEdit = mode === 'edit';
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    description: initialData?.description || '',
    quantity: initialData?.quantity?.toString() || '10',
    lowStockThreshold: initialData?.lowStockThreshold?.toString() || '5',
    vendorName: initialData?.vendorName || '',
    unitPrice: initialData?.unitPrice ? initialData.unitPrice.toString() : '',
    updateReason: initialData?.updateReason || '',
  });
  const [selectedMain, setSelectedMain] = useState('');
  const [selectedSub, setSelectedSub] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialData?.categoryId) {
      let foundMain = '';
      let foundSub = '';
      for (const main of categories) {
        if (main.id === initialData.categoryId) {
          foundMain = main.id.toString();
          break;
        }
        for (const sub of main.subcategories) {
          if (sub.id === initialData.categoryId) {
            foundMain = main.id.toString();
            foundSub = sub.id.toString();
            break;
          }
        }
        if (foundMain) break;
      }
      setSelectedMain(foundMain);
      setSelectedSub(foundSub);
    }
  }, [initialData, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const categoryId = selectedSub || selectedMain;
    if (!categoryId) {
      toast({ title: "Error", description: "Please select a category", variant: "destructive" });
      return;
    }

    if (!formData.name.trim()) {
      toast({ title: "Error", description: "Item name is required", variant: "destructive" });
      return;
    }

    const qty = Number(formData.quantity);
    if (isNaN(qty) || qty < 0) {
      toast({ title: "Error", description: "Valid quantity required (non-negative)", variant: "destructive" });
      return;
    }

    const threshold = Number(formData.lowStockThreshold);
    if (isNaN(threshold) || threshold < 0) {
      toast({ title: "Error", description: "Valid low stock threshold required (non-negative)", variant: "destructive" });
      return;
    }

    if (isEdit && !formData.updateReason.trim()) {
      toast({ title: "Error", description: "Update reason required", variant: "destructive" });
      return;
    }

    const price = formData.unitPrice ? Number(formData.unitPrice) : undefined;
    if (formData.unitPrice && formData.unitPrice.trim() && (isNaN(price) || price < 0)) {
      toast({ title: "Error", description: "Valid unit price required (non-negative)", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(
        {
          name: formData.name,
          description: formData.description,
          categoryId,
          quantity: qty,
          lowStockThreshold: threshold,
          vendorName: formData.vendorName || undefined,
          unitPrice: price,
          ...(isEdit && { updateReason: formData.updateReason }),
        },
        receiptFile
      );
    } catch (error) {
      console.error('Error in form submit:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = isInline 
    ? "w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
    : "w-full p-3 border border-[var(--border-strong)] rounded-lg bg-[var(--surface)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent shadow-[var(--shadow-md)]";

  return (
    <form onSubmit={handleSubmit} className={isInline ? "space-y-4 p-4 bg-[var(--surface-secondary)] rounded-lg" : "space-y-6"}>
      {!isInline && (
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">
            {isEdit ? 'Edit Item' : 'Add New Item'}
          </h2>
          <p className="text-[var(--text-secondary)] mt-1">
            {isEdit ? 'Update the item details below.' : 'Fill in the details to add a new item.'}
          </p>
        </div>
      )}

      {/* Basic Information Section */}
      <div className="bg-[var(--surface)] p-4 rounded-lg border border-[var(--border)] shadow-[var(--shadow-md)]">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center">
          <Package className="h-5 w-5 mr-2 text-blue-600" />
          Basic Information
        </h3>
        <div className={isInline ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>
          <div className="space-y-1">
            <Label htmlFor="name" className="text-sm font-medium text-[var(--text-body)]">Item Name *</Label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mainCategory" className="text-sm font-medium text-[var(--text-body)]">Main Category *</Label>
            <select
              id="mainCategory"
              value={selectedMain}
              onChange={(e) => {
                setSelectedMain(e.target.value);
                setSelectedSub('');
              }}
              className={inputClass}
              required
            >
              <option value="">Select Main Category</option>
              {categories.map(main => (
                <option key={main.id} value={main.id.toString()}>{main.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="subCategory" className="text-sm font-medium text-[var(--text-body)]">Subcategory</Label>
            <select
              id="subCategory"
              value={selectedSub}
              onChange={(e) => setSelectedSub(e.target.value)}
              className={inputClass}
              disabled={!selectedMain}
            >
              <option value="">None</option>
              {selectedMain && categories
                .find(main => main.id.toString() === selectedMain)
                ?.subcategories.map(sub => (
                  <option key={sub.id} value={sub.id.toString()}>{sub.name}</option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="quantity" className="text-sm font-medium text-[var(--text-body)]">Quantity *</Label>
            <input
              id="quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
              className={inputClass}
              min="0"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="threshold" className="text-sm font-medium text-[var(--text-body)]">Low Stock Threshold *</Label>
            <input
              id="threshold"
              type="number"
              value={formData.lowStockThreshold}
              onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
              className={inputClass}
              min="0"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="vendor" className="text-sm font-medium text-[var(--text-body)]">Vendor Name</Label>
            <input
              id="vendor"
              type="text"
              value={formData.vendorName}
              onChange={(e) => setFormData({ ...formData, vendorName: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price" className="text-sm font-medium text-[var(--text-body)]">Unit Price</Label>
            <input
              id="price"
              type="number"
              value={formData.unitPrice}
              onChange={(e) => setFormData({ ...formData, unitPrice: e.target.value })}
              className={inputClass}
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Additional Information Section */}
      <div className="bg-[var(--surface)] p-4 rounded-lg border border-[var(--border)] shadow-[var(--shadow-md)]">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center">
          <Image className="h-5 w-5 mr-2 text-purple-600" />
          Additional Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-1">
            <Label htmlFor="receipt" className="text-sm font-medium text-[var(--text-body)]">Receipt (Image or PDF)</Label>
            <input
              id="receipt"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              className={`${inputClass} file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100`}
            />
          </div>
          <div className="space-y-1 md:col-span-1">
            <Label htmlFor="description" className="text-sm font-medium text-[var(--text-body)]">Description</Label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={`${inputClass} col-span-2 resize-none`}
              rows={3}
              placeholder="Enter item description..."
            />
          </div>
        </div>
      </div>

      {/* Edit Specific Section */}
      {isEdit && (
        <div className="bg-[var(--surface)] p-4 rounded-lg border border-[var(--border)] shadow-[var(--shadow-md)]">
          <h3 className="font-semibold text-[var(--text-primary)] mb-4 flex items-center">
            <Edit className="h-5 w-5 mr-2 text-green-600" />
            Update Details
          </h3>
          <div className="space-y-1">
            <Label htmlFor="updateReason" className="text-sm font-medium text-[var(--text-body)]">Update Reason *</Label>
            <textarea
              id="updateReason"
              value={formData.updateReason}
              onChange={(e) => setFormData({ ...formData, updateReason: e.target.value })}
              className={`${inputClass} col-span-2 resize-none`}
              rows={2}
              placeholder="Enter reason for this update..."
              required
            />
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-4">
        <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white flex-1 sm:flex-none">
          {isSubmitting ? 'Saving...' : (isEdit ? 'Update Item' : 'Add Item')}
        </Button>
        <Button type="button" onClick={onCancel} variant="outline" disabled={isSubmitting} className="flex-1 sm:flex-none">
          Cancel
        </Button>
      </div>
    </form>
  );
};

export default ItemForm;