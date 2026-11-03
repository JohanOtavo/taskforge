"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

/// Fondo de la aplicacion: placas de metal suspendidas en una forja, con
/// chispas que suben. Decoracion pura, asi que todo lo que cuesta esta acotado:
/// 30 fotogramas por segundo, nada de sombras, geometria instanciada y parada
/// total con la pestana oculta.

const FRAME_MS = 1000 / 30;
const COLD_SLABS = 16;
const HOT_SLABS = 3;
const SPARKS = 90;
const SPREAD_X = 22;
const SPREAD_Y = 13;
const SPARK_TOP = 7;
const NEAREST_SLAB = 5;
const FOG_NEAR = 9;
const FOG_FAR = 26;

type Palette = {
  background: string;
  metal: string;
  hot: string;
  ember: string;
  cool: string;
  isDark: boolean;
};

/// Los colores salen de las variables CSS, igual que el resto de la interfaz.
function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => css.getPropertyValue(name).trim();
  return {
    background: read("--bg"),
    metal: read("--scene-metal"),
    hot: read("--scene-hot"),
    ember: read("--scene-ember"),
    cool: read("--scene-cool"),
    isDark: read("--scene-mode") === "dark",
  };
}

/// Generador con semilla: la composicion es la misma en cada carga, y se puede
/// ajustar a ojo sin que cambie al recargar.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function roundedSlab(): THREE.ExtrudeGeometry {
  const w = 1.5;
  const h = 0.95;
  const r = 0.09;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSize: 0.018,
    bevelThickness: 0.018,
    bevelSegments: 2,
    curveSegments: 5,
  });
}

function Slabs({
  count,
  seed,
  children,
}: {
  count: number;
  seed: number;
  children: React.ReactNode;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => roundedSlab(), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const specs = useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: count }, () => ({
      x: (random() - 0.5) * SPREAD_X,
      y: (random() - 0.5) * SPREAD_Y,
      z: -NEAREST_SLAB - random() * 9,
      rx: (random() - 0.5) * 0.7,
      ry: (random() - 0.5) * 1,
      rz: (random() - 0.5) * 0.35,
      speed: 0.12 + random() * 0.18,
      phase: random() * Math.PI * 2,
      scale: 0.8 + random() * 0.7,
    }));
  }, [count, seed]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock }) => {
    const node = mesh.current;
    if (!node) return;
    const elapsed = clock.elapsedTime;
    specs.forEach((spec, index) => {
      const t = elapsed * spec.speed + spec.phase;
      dummy.position.set(spec.x, spec.y + Math.sin(t) * 0.28, spec.z);
      dummy.rotation.set(spec.rx + Math.sin(t * 0.7) * 0.1, spec.ry + t * 0.12, spec.rz);
      dummy.scale.setScalar(spec.scale);
      dummy.updateMatrix();
      node.setMatrixAt(index, dummy.matrix);
    });
    node.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[geometry, undefined, count]} frustumCulled={false}>
      {children}
    </instancedMesh>
  );
}

function sparkTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(canvas);
}

function Sparks({ color, additive }: { color: string; additive: boolean }) {
  const points = useRef<THREE.Points>(null);
  const texture = useMemo(() => sparkTexture(), []);

  const { positions, speeds } = useMemo(() => {
    const random = seeded(7);
    const initial = new Float32Array(SPARKS * 3);
    const rates = new Float32Array(SPARKS);
    for (let i = 0; i < SPARKS; i += 1) {
      initial[i * 3] = (random() - 0.5) * SPREAD_X;
      initial[i * 3 + 1] = (random() - 0.5) * SPARK_TOP * 2;
      initial[i * 3 + 2] = -random() * 8;
      rates[i] = 0.25 + random() * 0.7;
    }
    return { positions: initial, speeds: rates };
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  useFrame(({ clock }, delta) => {
    const node = points.current;
    if (!node) return;
    const attribute = node.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    // Tras una pausa larga el delta es enorme: sin el tope, todas las chispas
    // saltarian de golpe al volver a la pestana.
    const step = Math.min(delta, 0.1);
    for (let i = 0; i < SPARKS; i += 1) {
      const y = array[i * 3 + 1] + speeds[i] * step;
      array[i * 3 + 1] = y > SPARK_TOP ? -SPARK_TOP : y;
      array[i * 3] += Math.sin(clock.elapsedTime * speeds[i] + i) * 0.002;
    }
    attribute.needsUpdate = true;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={texture}
        color={color}
        size={0.11}
        transparent
        opacity={additive ? 0.9 : 0.65}
        depthWrite={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  );
}

/// Paralaje amortiguado: seguir el puntero 1:1 marea y delata que es un efecto.
function CameraRig() {
  const target = useRef({ x: 0, y: 0 });

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

  // La camara se toma del estado del fotograma: es un objeto de three.js que
  // se mueve en cada frame, no un valor de React.
  useFrame(({ camera }, delta) => {
    const k = 1 - Math.pow(0.02, delta);
    camera.position.x += (target.current.x * 0.5 - camera.position.x) * k;
    camera.position.y += (-target.current.y * 0.35 - camera.position.y) * k;
    camera.lookAt(0, 0, -4);
  });

  return null;
}

/// Pide fotogramas a 30 por segundo y solo con la pestana visible. Con el bucle
/// por defecto, un fondo decorativo gastaria bateria a la frecuencia del monitor.
function Ticker() {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [invalidate]);

  return null;
}

export default function ForgeScene3D() {
  const [palette, setPalette] = useState<Palette>(readPalette);

  useEffect(() => {
    const sync = () => setPalette(readPalette());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    // El tema elegido a mano cambia un atributo, no el media query.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      media.removeEventListener("change", sync);
      observer.disconnect();
    };
  }, []);

  return (
    <Canvas
      aria-hidden
      flat
      frameloop="demand"
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 50 }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <Ticker />
      <CameraRig />
      {/* La niebla funde lo lejano con el fondo: da profundidad y evita que
          las placas compitan con el contenido. */}
      <fog attach="fog" args={[palette.background, FOG_NEAR, FOG_FAR]} />
      <ambientLight intensity={palette.isDark ? 0.9 : 2.2} />
      <directionalLight
        position={[3, 7, 6]}
        intensity={palette.isDark ? 1.2 : 0.9}
        color={palette.cool}
      />
      <pointLight
        position={[0, -8, -6]}
        intensity={palette.isDark ? 140 : 30}
        color={palette.ember}
        distance={24}
      />

      {/* Metalness baja a proposito: sin mapa de entorno, un metal "de verdad"
          no tiene nada que reflejar y se ve negro. */}
      <Slabs count={COLD_SLABS} seed={42}>
        <meshStandardMaterial color={palette.metal} metalness={0.25} roughness={0.55} />
      </Slabs>
      <Slabs count={HOT_SLABS} seed={1337}>
        <meshStandardMaterial
          color={palette.hot}
          emissive={palette.ember}
          emissiveIntensity={palette.isDark ? 0.7 : 0.12}
          metalness={0.2}
          roughness={0.5}
        />
      </Slabs>
      <Sparks color={palette.ember} additive={palette.isDark} />
    </Canvas>
  );
}
