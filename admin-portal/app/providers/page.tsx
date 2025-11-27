"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProvidersRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/business-settings#providers");
  }, [router]);
  return null;
}
