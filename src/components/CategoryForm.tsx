import React, { useState, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus } from 'lucide-react';

interface Subcategory {
  id?: string;
  name: string;
  description: string;
}

interface CategoryFormProps {
  category?: {
    id?: string;
    name: string;
    description: string;
    subcategories: Subcategory[];
  } | null;
  onSave: (data: { name: string; description: string; subcategories: Subcategory[] }) => void;
  onCancel: () => void;
}

const CategoryForm: React.FC<CategoryFormProps> = ({ category, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subcategories: [] as Subcategory[]
  });
  const { toast } = useToast();

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        description: category.description || '',
        subcategories: category.subcategories || []
      });
    } else {
      setFormData({
        name: '',
        description: '',
        subcategories: []
      });
    }
  }, [category]);

  const handleMainChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubChange = (index: number, field: string, value: string) => {
    const newSubs = [...formData.subcategories];
    newSubs[index] = { ...newSubs[index], [field]: value };
    setFormData(prev => ({ ...prev, subcategories: newSubs }));
  };

  const addSubcategory = () => {
    setFormData(prev => ({
      ...prev,
      subcategories: [...prev.subcategories, { name: '', description: '' }]
    }));
  };

  const removeSubcategory = (index: number) => {
    const newSubs = formData.subcategories.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, subcategories: newSubs }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Main category name is required",
        variant: "destructive"
      });
      return;
    }

    for (const sub of formData.subcategories) {
      if (!sub.name.trim()) {
        toast({
          title: "Error",
          description: "Subcategory names are required",
          variant: "destructive"
        });
        return;
      }
    }
    onSave(formData);
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
            Main Category Name *
          </label>
          <Input
            type="text"
            value={formData.name}
            onChange={(e) => handleMainChange('name', e.target.value)}
            required
            className="h-12 text-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
            Main Category Description
          </label>
          <Textarea
            value={formData.description}
            onChange={(e) => handleMainChange('description', e.target.value)}
            rows={5}
            className="text-lg"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-medium text-[var(--text-body)]">
              Subcategories
            </label>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={addSubcategory}
              className="flex items-center h-11 text-lg"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Subcategory
            </Button>
          </div>
          {formData.subcategories.map((sub, index) => (
            <div key={index} className="border border-[var(--border)] rounded-lg p-5 mb-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
                  Subcategory Name *
                </label>
                <Input
                  type="text"
                  value={sub.name}
                  onChange={(e) => handleSubChange(index, 'name', e.target.value)}
                  required
                  className="h-11 text-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-body)] mb-2">
                  Subcategory Description
                </label>
                <Textarea
                  value={sub.description}
                  onChange={(e) => handleSubChange(index, 'description', e.target.value)}
                  rows={3}
                  className="text-lg"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                size="lg"
                onClick={() => removeSubcategory(index)}
                className="flex items-center h-11 text-lg"
              >
                <Trash2 className="h-5 w-5 mr-2" />
                Remove
              </Button>
            </div>
          ))}
          {formData.subcategories.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No subcategories added yet.</p>
          )}
        </div>

        <div className="flex justify-end space-x-4 pt-6">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onCancel}
            className="h-11 text-lg"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="lg"
            className="h-11 text-lg"
          >
            {category ? 'Update' : 'Add'} Category
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CategoryForm;
