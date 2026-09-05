"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

// Remembers the first visit's ref / utm_* in localStorage; ProfileForm sends it once when the profile is created.
export function Attribution() {
  useEffect(() => captureAttribution(), []);
  return null;
}
