"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMonitoring, useSession } from "../../../context/AppContext";
import FocusSpace from "../../../components/focus/FocusSpace";

export default function ProductFocusPage() {
  const router = useRouter();
  const { activeSession } = useSession();
  const { isCameraAllowed } = useMonitoring();
  const canUseFocus = (activeSession?.status === "active" || activeSession?.status === "paused") && isCameraAllowed;

  useEffect(() => {
    if (!canUseFocus) {
      router.replace("/app");
    }
  }, [canUseFocus, router]);

  if (!canUseFocus) return null;

  return <FocusSpace />;
}
