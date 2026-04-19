"use client";

import { useEffect, useState } from "react";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowReconnected(false);
      return;
    }
    if (wasOffline) {
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [online, wasOffline]);

  if (online && !showReconnected) return null;

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-app z-[300] px-4 pt-[max(8px,env(safe-area-inset-top))] animate-fadeIn">
      <div
        className={`flex items-center justify-center gap-2 py-[8px] px-4 rounded-[12px] text-[12px] font-medium shadow-card ${
          online ? "bg-green text-white" : "bg-text-main text-white"
        }`}
      >
        <span className="text-[14px]">{online ? "✓" : "⚡"}</span>
        {online ? "Соединение восстановлено" : "Нет интернета, офлайн режим"}
      </div>
    </div>
  );
}
