"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { AuthScene } from "./auth-scene";

/// `ssr: false` no es opcional: three.js toca `window` al importarse y el
/// render del servidor reventaria. Diferido ademas porque es decoracion — el
/// formulario tiene que poder usarse antes de que llegue el bundle de WebGL.
const AuthScene3D = dynamic(() => import("./auth-scene-3d"), { ssr: false });

/// Mejora progresiva en dos escalones:
///
///   1. Siempre se pinta la escena en CSS, que llega con el HTML.
///   2. Si hay WebGL y el usuario no ha pedido menos movimiento, encima se
///      monta la escena real y la de CSS se desvanece.
///
/// Asi nadie ve un hueco vacio: ni quien tenga la GPU bloqueada, ni quien
/// navegue con `prefers-reduced-motion`, ni quien esté esperando la descarga.
export function AuthBackdrop({ className }: { className?: string }) {
  const [use3d, setUse3d] = useState(false);

  useEffect(() => {
    let frame = 0;

    const detect = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Una pagina de login en un portatil modesto no merece una escena 3D.
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return;

    // Se comprueba creando un contexto de verdad: la presencia de la API no
    // garantiza que el driver lo conceda.
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return;
    gl.getExtension("WEBGL_lose_context")?.loseContext();

      setUse3d(true);
    };

    // Un frame de margen: primero se pinta la escena CSS, despues se
    // decide si vale la pena montar la de WebGL encima.
    frame = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div aria-hidden className={className}>
      <AuthScene
        className={`absolute inset-0 transition-opacity duration-700 ${use3d ? "opacity-0" : "opacity-100"}`}
      />
      {use3d && <AuthScene3D />}
    </div>
  );
}
