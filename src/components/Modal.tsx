import React from 'react';
import { X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--surface)] rounded-xl max-h-[90vh] overflow-y-auto shadow-[var(--shadow-md)] border border-[var(--border)]">
        <div className="p-6 w-full">
          <div className="flex items-center justify-between border-b border-[var(--border)] mb-4">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
            <button
              onClick={onClose}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-body)] transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;
