import { cn } from "@/lib/cn";

/// Escena decorativa: tarjetas kanban flotando en un espacio con
/// perspectiva. Es CSS 3D, no WebGL — son elementos reales en un contenedor
/// con `perspective`, asi que no hay canvas, ni shaders, ni medio mega de
/// dependencia en la pagina que mas rapido tiene que cargar.
///
/// `aria-hidden`: no comunica nada, y anunciarla seria ruido para quien use
/// un lector de pantalla.

type Card = {
  label: string;
  color: string;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  delay: number;
};

// Las posiciones se eligen para que ninguna tarjeta toque el borde a
// 1280px: con mas separacion se recortan, con menos invaden el formulario.
const CARDS: Card[] = [
  { label: "Por hacer", color: "var(--label-blue)", x: -33, y: -20, z: 70, rx: 6, ry: 20, delay: 0 },
  { label: "En curso", color: "var(--label-amber)", x: -29, y: 19, z: -60, rx: -6, ry: 16, delay: 1.6 },
  { label: "En revision", color: "var(--label-violet)", x: 31, y: -21, z: -30, rx: 9, ry: -22, delay: 3.2 },
  { label: "Hecho", color: "var(--label-green)", x: 29, y: 18, z: 40, rx: -7, ry: -17, delay: 4.8 },
];

export function AuthScene({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("scene pointer-events-none select-none", className)}>
      <div className="relative h-full w-full" style={{ transformStyle: "preserve-3d" }}>
        {CARDS.map((card) => (
          <div
            key={card.label}
            className="float-slow absolute left-1/2 top-1/2 w-44 rounded-xl border border-border bg-surface p-3 lift-2"
            style={
              {
                // El translate del centrado va PRIMERO: el orden de las
                // transformaciones no es conmutativo y si va al final la
                // tarjeta orbita en vez de girar sobre si misma.
                marginLeft: `${card.x}%`,
                marginTop: `${card.y}%`,
                "--rx": `${card.rx}deg`,
                "--ry": `${card.ry}deg`,
                transform: `translate(-50%, -50%) translateZ(${card.z}px) rotateX(${card.rx}deg) rotateY(${card.ry}deg)`,
                animationDelay: `${card.delay}s`,
              } as React.CSSProperties
            }
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: card.color }} />
              <span className="text-[11px] font-semibold text-text-muted">{card.label}</span>
            </div>
            <div className="mt-2.5 space-y-1.5">
              <div className="h-2 w-full rounded bg-surface-2" />
              <div className="h-2 w-3/5 rounded bg-surface-2" />
            </div>
            <div className="mt-3 flex gap-1.5">
              <span className="h-3.5 w-10 rounded-full" style={{ background: card.color, opacity: 0.25 }} />
              <span className="h-3.5 w-6 rounded-full bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
