"use client";

import { useEffect } from "react";

import { DarkVeil } from "@/components/dark-veil";

type PublicPageBackgroundProps = {
  hueShift?: number;
  speed?: number;
};

export function PublicPageBackground({ hueShift = 0, speed = 0.9 }: PublicPageBackgroundProps) {
  useEffect(() => {
    document.body.classList.add("public-shell");
    return () => document.body.classList.remove("public-shell");
  }, []);

  return (
    <div aria-hidden className="darkveil-root">
      <DarkVeil hueShift={hueShift} speed={speed} />
      <div className="darkveil-overlay" />
    </div>
  );
}
