import { useEffect, useState, useRef } from "react";
import { fetchLowStockItems, type LowStockItem } from "@/application/queries/low-stock.query";
import { AlertTriangle, X, Package } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { notifyLowInventory } from "@/lib/notifications";

export const LowStockAlert = () => {
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const notifiedItemsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const checkLowStock = async () => {
      // Check if alert was dismissed this session
      const dismissedKey = `lowStockDismissed_${new Date().toDateString()}`;
      if (sessionStorage.getItem(dismissedKey)) {
        setDismissed(true);
        return;
      }

      const lowStock = await fetchLowStockItems();
      setLowStockItems(lowStock);

      // Create in-app notifications for newly detected low stock items
      // Only notify once per session per item
      const notifiedKey = `lowStockNotified_${new Date().toDateString()}`;
      const previouslyNotified = new Set(
        JSON.parse(sessionStorage.getItem(notifiedKey) || '[]')
      );

      for (const item of lowStock) {
        if (!previouslyNotified.has(item.id) && !notifiedItemsRef.current.has(item.id)) {
          notifiedItemsRef.current.add(item.id);
          previouslyNotified.add(item.id);
          
          // Create in-app notification
          await notifyLowInventory(item.name, item.quantity, item.low_stock_threshold);
        }
      }

      // Save notified items to session storage
      sessionStorage.setItem(notifiedKey, JSON.stringify([...previouslyNotified]));
    };

    checkLowStock();
  }, []);

  const handleDismiss = () => {
    const dismissedKey = `lowStockDismissed_${new Date().toDateString()}`;
    sessionStorage.setItem(dismissedKey, "true");
    setDismissed(true);
  };

  if (dismissed || lowStockItems.length === 0) return null;

  return (
    <Alert variant="destructive" className="relative bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400">
      <AlertTriangle className="h-5 w-5 text-yellow-600" />
      <AlertTitle className="font-semibold flex items-center gap-2">
        Low Stock Alert
        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
          {lowStockItems.length} {lowStockItems.length === 1 ? "item" : "items"}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <p className="mb-3">The following items are running low and need restocking:</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {lowStockItems.slice(0, 5).map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 bg-background/50 rounded-md px-3 py-1.5 text-sm"
            >
              <Package className="h-4 w-4" />
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground">
                ({item.quantity}/{item.low_stock_threshold})
              </span>
            </div>
          ))}
          {lowStockItems.length > 5 && (
            <span className="text-sm text-muted-foreground self-center">
              +{lowStockItems.length - 5} more
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-yellow-500/50 hover:bg-yellow-500/10"
          onClick={() => navigate("/inventory")}
        >
          View Inventory
        </Button>
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6 hover:bg-yellow-500/20"
        onClick={handleDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </Alert>
  );
};
