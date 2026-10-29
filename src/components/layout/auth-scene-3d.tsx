"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/// Escena WebGL del login: tarjetas kanban flotando en un espacio real con
/// luces y profundidad de verdad, no simulada con transformaciones.
///
/// Es puramente decorativa, asi que todo lo que cuesta se paga solo cuando
/// aporta: se carga de forma diferida, se apaga con movimiento reducido y, si
/// no hay WebGL, no se monta y queda la escena CSS por debajo.

type CardSpec = {
  position: [number, number, number];
  rotation: [number, number, number];
  color: keyof ThemeColors["labels"];
  speed: number;
  phase: number;
};

const CARDS: CardSpec[] = [
  { position: [-4.3, 1.1, -0.6], rotation: [0.12, 0.46, -0.07], color: "blue", speed: 0.55, phase: 0 },
  { position: [-3.6, -1.6, -2.2], rotation: [-0.1, 0.34, 0.09], color: "amber", speed: 0.42, phase: 1.7 },
  { position: [4.2, 1.4, -1.2], rotation: [0.16, -0.5, 0.06], color: "violet", speed: 0.5, phase: 3.1 },
  { position: [3.7, -1.7, -0.3], rotation: [-0.14, -0.38, -0.08], color: "green", speed: 0.47, phase: 4.6 },
  { position: [-0.4, 2.6, -4.2], rotation: [0.22, 0.12, 0.03], color: "teal", speed: 0.38, phase: 2.4 },
];

type ThemeColors = {
  surface: string;
  border: string;
  accent: string;
  muted: string;
  labels: Record<"blue" | "amber" | "violet" | "green" | "teal", string>;
};

/// Los colores salen de las mismas variables CSS que el resto de la interfaz.
/// Duplicarlos aqui garantizaria que un dia dejen de coincidir.
function readTheme(): ThemeColors {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    css.getPropertyValue(name).trim() || fallback;

  return {
    surface: read("--surface", "#ffffff"),
    border: read("--border", "#dde1ea"),
    accent: read("--accent", "#4c6ef5"),
    muted: read("--text-muted", "#646c7e"),
    labels: {
      blue: read("--label-blue", "#2563eb"),
      amber: read("--label-amber", "#d97706"),
      violet: read("--label-violet", "#7c3aed"),
      green: read("--label-green", "#16a34a"),
      teal: read("--label-teal", "#0d9488"),
    },
  };
}

function Card({ spec, theme }: { spec: CardSpec; theme: ThemeColors }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state) => {
    const node = group.current;
    if (!node) return;
    const t = state.clock.elapsedTime * spec.speed + spec.phase;
    // Flotacion y balanceo. Amplitudes pequenas: por encima de esto deja de
    // leerse como "suspendido" y pasa a "sacudiendose".
    node.position.y = spec.position[1] + Math.sin(t) * 0.22;
    node.rotation.x = spec.rotation[0] + Math.sin(t * 0.8) * 0.06;
    node.rotation.y = spec.rotation[1] + Math.cos(t * 0.6) * 0.09;
  });

  return (
    <group ref={group} position={spec.position} rotation={spec.rotation}>
      {/* Cuerpo de la tarjeta. */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.6, 1.05, 0.05]} />
        <meshStandardMaterial
          color={theme.surface}
          roughness={0.55}
          metalness={0}
        />
      </mesh>

      {/* Franja de color, ligeramente por delante para que no haya z-fighting. */}
      <mesh position={[-0.52, 0.34, 0.031]}>
        <boxGeometry args={[0.44, 0.1, 0.01]} />
        <meshStandardMaterial
          color={theme.labels[spec.color]}
          emissive={theme.labels[spec.color]}
          emissiveIntensity={0.35}
          roughness={0.3}
        />
      </mesh>

      {/* Lineas de texto simuladas. */}
      {[0.08, -0.1, -0.28].map((y, i) => (
        <mesh key={y} position={[-0.18 - i * 0.12, y, 0.031]}>
          <boxGeometry args={[1.0 - i * 0.24, 0.055, 0.01]} />
          <meshStandardMaterial color={theme.muted} roughness={0.8} transparent opacity={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/// Paralaje de camara. El movimiento es amortiguado, no directo: seguir el
/// puntero 1:1 marea y delata que es un efecto.
function CameraRig() {
  const target = useRef({ x: 0, y: 0 });
  const { camera } = useThree();

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      target.current = {
        x: (event.clientX / window.innerWidth - 0.5) * 2,
        y: (event.clientY / window.innerHeight - 0.5) * 2,
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, delta) => {
    // Interpolacion dependiente del delta: a 144 Hz no debe ir el doble de
    // rapido que a 60.
    const k = 1 - Math.pow(0.001, delta);
    camera.position.x += (target.current.x * 0.9 - camera.position.x) * k;
    camera.position.y += (-target.current.y * 0.6 - camera.position.y) * k;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

export default function AuthScene3D() {
  // Inicializador perezoso en vez de efecto: leer el tema en un efecto
  // provocaba un segundo render inmediato con la escena ya montada.
  const [theme, setTheme] = useState<ThemeColors | null>(() =>
    typeof document === "undefined" ? null : readTheme(),
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setTheme(readTheme());

    media.addEventListener("change", sync);
    // Algunos entornos (emulacion del navegador, extensiones de tema) cambian
    // las variables sin disparar el evento del media query. Releer al volver
    // a la pestana cubre ese caso sin sondear en bucle.
    document.addEventListener("visibilitychange", sync);

    return () => {
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const cards = useMemo(() => CARDS, []);
  if (!theme) return null;

  return (
    <Canvas
      aria-hidden
      // `flat` desactiva el tone mapping ACES que R3F pone por defecto. Esta
      // pensado para escenas con rango dinamico alto; aqui solo apagaba los
      // blancos y dejaba las tarjetas grises en tema claro.
      flat
      // Sin alpha la escena taparia el degradado del body.
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 7], fov: 50 }}
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Mucho relleno y poca direccional: con la proporcion inversa, una
          tarjeta blanca se renderiza gris en tema claro. */}
      <ambientLight intensity={2.1} />
      <directionalLight position={[4, 6, 8]} intensity={0.9} />
      {/* Luz de acento por detras: separa las tarjetas del fondo. */}
      <pointLight position={[-5, -2, -4]} intensity={28} color={theme.accent} distance={16} />

      {cards.map((spec) => (
        <Card key={`${spec.color}-${spec.phase}`} spec={spec} theme={theme} />
      ))}

      <CameraRig />
    </Canvas>
  );
}
