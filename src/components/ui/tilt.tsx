"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
  children: ReactNode;
  className?: string;
  /// Grados maximos de giro. Por encima de ~10 deja de parecer profundidad y
  /// empieza a parecer un efecto.
  max?: number;
  /// Cuanto se despega del plano al apuntarla, en px.
  lift?: number;
  disabled?: boolean;
};

/// Inclinacion 3D que sigue al puntero.
///
/// Se calcula a mano en vez de con una libreria porque son veinte lineas y
/// porque el control del evento importa: `pointermove` sin `pointerdown` es
/// justo lo que NO debe interferir con dnd-kit, que escucha el arrastre.
///
/// Solo reacciona a un puntero fino (raton o lapiz). En tactil, inclinar al
/// tocar pelea con el arrastre y no aporta nada: el dedo tapa la tarjeta.
export function Tilt({ children, className, max = 7, lift = 14, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [tilting, setTilting] = useState(false);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (disabled || event.pointerType === "touch") return;
    const node = ref.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    // Normalizado a [-0.5, 0.5] desde el centro del elemento.
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;

    setTilting(true);
    setStyle({
      // rotateX invertido: mover el puntero hacia arriba debe inclinar el
      // borde superior HACIA el usuario, no alejarlo.
      transform: `rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateZ(${lift}px)`,
      "--glare-x": `${((px + 0.5) * 100).toFixed(1)}%`,
      "--glare-y": `${((py + 0.5) * 100).toFixed(1)}%`,
    } as CSSProperties);
  }

  function reset() {
    setTilting(false);
    setStyle({});
  }

  return (
    <div
      ref={ref}
      className={cn("card-3d card-glare relative", className)}
      style={style}
      data-tilting={tilting}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      // Al empezar a arrastrar, la inclinacion estorba: la transformacion del
      // arrastre y la del puntero se multiplicarian.
      onPointerDown={reset}
    >
      {children}
    </div>
  );
}
