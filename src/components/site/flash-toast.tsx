"use client";

import { useEffect } from "react";
import { toast } from "sonner";

export const FLASH_KEY = "ut:flash";

// One-shot toast that survives a hard navigation (used after account deletion + sign-out).
export function FlashToast() {
  useEffect(() => {
    const msg = sessionStorage.getItem(FLASH_KEY);
    if (!msg) return;
    sessionStorage.removeItem(FLASH_KEY);
    toast.success(msg);
  }, []);
  return null;
}
