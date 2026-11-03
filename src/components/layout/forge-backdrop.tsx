"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/// `ssr: false` no es opcional: three.js toca `window` al importarse. Diferido
/// ademas porque es decoracion: la pagina tiene que poder usarse antes de que
/// llegue el bundle de WebGL.
const ForgeScene3D = dynamic(() => import("./forge-scene-3d"), { ssr: false });

const MIN_WIDTH_PX = 768;
const MIN_CORES = 4;

function canAfford3d(): boolean {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  // En un movil gastaria bateria detras de contenido que tapa casi toda la pantalla.
  if (window.innerWidth < MIN_WIDTH_PX) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < MIN_CORES) return false;

  // Se comprueba creando un contexto de verdad: la presencia de la API no
  // garantiza que el driver lo conceda.
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) return false;
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return true;
}

/// Mejora progresiva: el resplandor del <body> en CSS llega siempre con el
/// HTML; si hay GPU y nadie ha pedido menos movimiento, encima va la escena.
export function ForgeBackdrop() {
  const [use3d, setUse3d] = useState(false);

  useEffect(() => {
    // Un frame de margen: primero se pinta la pagina, despues se decide.
    const frame = requestAnimationFrame(() => setUse3d(canAfford3d()));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {use3d && <ForgeScene3D />}
    </div>
  );
}
