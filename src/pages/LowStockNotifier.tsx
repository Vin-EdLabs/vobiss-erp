import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getItems } from '../api';
import { useToast } from '@/hooks/use-toast';

interface Item {
  id: number;
  name: string;
  quantity: number;
  low_stock_threshold: number | null;
}

const LowStockNotifier: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const lastItemsRef = useRef<{ [id: string]: number }>({});
  const notifiedItemsRef = useRef<Set<number>>(new Set()); // Track items already notified to prevent repeats

  const allowedRoles = ['superadmin', 'issuer'];
  if (!user || !allowedRoles.includes(user.role)) {
    return null;
  }

  useEffect(() => {
    const checkLowStock = async () => {
      try {
        const items = await getItems();
        const lowStock = items.filter(item => item.quantity <= (item.low_stock_threshold || 0));

        // Only notify for truly new low stock: quantity decreased OR first time hitting threshold
        const newLowStock = lowStock.filter(item => {
          const prevQuantity = lastItemsRef.current[item.id];
          const isNewLow = !prevQuantity || prevQuantity > item.quantity;
          const alreadyNotified = notifiedItemsRef.current.has(item.id);
          return isNewLow && !alreadyNotified;
        });

        if (newLowStock.length > 0) {
          // Mark as notified
          newLowStock.forEach(item => notifiedItemsRef.current.add(item.id));

          toast({
            title: "Low Stock Notification",
            description: (
              <div className="space-y-2">
                <p className="text-sm text-gray-700">The following items are running low:</p>
                {newLowStock.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <span className="text-sm">{item.name}: <span className="font-semibold">{item.quantity}</span> (Threshold: {item.low_stock_threshold || 0})</span>
                    <span className={item.quantity === 0 ? 'text-orange-600' : 'text-amber-600'}>
                      {item.quantity === 0 ? 'OUT' : 'LOW'}
                    </span>
                  </div>
                ))}
              </div>
            ),
            duration: 15000,
            className: "border border-amber-200 bg-amber-50",
            // Assuming useToast is based on sonner or similar; configure for center positioning
            // If using sonner, pass position="top-center" or customize the ToastProvider
            // For true screen-center, consider switching to a modal (see note below)
          });
        }

        // Update last quantities (using ref to avoid re-triggering effect)
        lastItemsRef.current = items.reduce((acc, item) => ({ ...acc, [item.id]: item.quantity }), {});
      } catch (error) {
        console.error('Error checking low stock:', error);
      }
    };

    checkLowStock();
    const interval = setInterval(checkLowStock, 10000);
    return () => clearInterval(interval);
  }, [user]); // Removed lastItems from deps; use ref instead to prevent re-runs

  return null;
};

export default LowStockNotifier;