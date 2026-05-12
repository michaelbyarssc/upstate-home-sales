'use client';

import { Suspense, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

/**
 * PR 3.3 — split out from design-studio.tsx so the heavy R3F + three modules
 * land in their own chunk. The parent imports this via `next/dynamic` and
 * only mounts it in 3D mode. Photo-mode users on low-end devices never
 * download the chunk.
 */

type CanvasProps = {
  glbUrl: string | null;
  slotColors: Record<string, string>;
  materialManifest: Record<string, string | string[]>;
};

function PlaceholderHome({ slotColors }: { slotColors: Record<string, string> }) {
  const sidingColor = slotColors['siding_main'] ?? '#cbb89a';
  const trimColor = slotColors['trim_main'] ?? '#ffffff';
  const roofColor = slotColors['roof_main'] ?? '#5a3b2c';
  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, 1, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 2, 3]} />
        <meshStandardMaterial color={sidingColor} />
      </mesh>
      <mesh position={[0, 2.05, 0]} castShadow>
        <boxGeometry args={[6.02, 0.1, 3.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[0, 2.7, 0]} castShadow rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[3.6, 1.2, 4]} />
        <meshStandardMaterial color={roofColor} />
      </mesh>
      <mesh position={[0, 0.7, 1.51]}>
        <boxGeometry args={[0.7, 1.4, 0.05]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#e8e2d5" />
      </mesh>
    </group>
  );
}

function GlbHome({ url, slotColors, manifest }: {
  url: string;
  slotColors: Record<string, string>;
  manifest: Record<string, string | string[]>;
}) {
  const gltf = useLoader(GLTFLoader, url);
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((obj) => {
      const isMesh = (o: unknown): o is THREE.Mesh =>
        (o as THREE.Mesh).isMesh === true;
      if (!isMesh(obj)) return;
      for (const [slot, meshNames] of Object.entries(manifest)) {
        const names = Array.isArray(meshNames) ? meshNames : [meshNames];
        if (!names.includes(obj.name)) continue;
        const color = slotColors[slot];
        if (!color) continue;
        const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        if (m && 'color' in m) {
          const clonedM = (m as THREE.MeshStandardMaterial).clone();
          clonedM.color = new THREE.Color(color);
          obj.material = clonedM;
        }
      }
    });
    return cloned;
  }, [gltf, slotColors, manifest]);
  return <primitive object={scene} />;
}

export default function Design3dCanvas({ glbUrl, slotColors, materialManifest }: CanvasProps) {
  return (
    <Canvas shadows camera={{ position: [8, 5, 8], fov: 38 }}>
      <Suspense fallback={
        <Html center>
          <div style={{ color: '#fff', fontSize: 13 }}>Loading scene…</div>
        </Html>
      }>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 10, 5]} intensity={1.1} castShadow />
        {glbUrl ? (
          <GlbHome url={glbUrl} slotColors={slotColors} manifest={materialManifest} />
        ) : (
          <PlaceholderHome slotColors={slotColors} />
        )}
        <Environment preset="sunset" />
        <OrbitControls makeDefault enableDamping target={[0, 1, 0]} maxPolarAngle={Math.PI / 2.2} />
      </Suspense>
    </Canvas>
  );
}
