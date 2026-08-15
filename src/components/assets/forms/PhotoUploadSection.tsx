// src/components/assets/forms/PhotoUploadSection.tsx
import React, { useState } from 'react';
import { Upload, X } from 'lucide-react';

interface Props {
  photos: File[];
  setPhotos: (files: File[]) => void;
}

export default function PhotoUploadSection({ photos, setPhotos }: Props) {
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPhotos([...photos, ...Array.from(e.target.files)]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">Photos</h2>
      
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
        <input
          type="file"
          multiple
          accept="image/*"
          onChange={handleFiles}
          className="hidden"
          id="photo-upload"
        />
        <label htmlFor="photo-upload" className="cursor-pointer">
          <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700">Click to upload photos</p>
          <p className="text-sm text-gray-500 mt-2">or drag and drop</p>
        </label>
      </div>

      {photos.length > 0 && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map((file, i) => (
            <div key={i} className="relative group">
              <img
                src={URL.createObjectURL(file)}
                alt={`Preview ${i + 1}`}
                className="w-full h-32 object-cover rounded-lg border"
              />
              <button
                onClick={() => removePhoto(i)}
                className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}