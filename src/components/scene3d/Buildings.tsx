import { buildingPositions } from '../../data/villageLayout';
import { useAppStore } from '../../store/useAppStore';
import type { Vector3D } from '../../types';
import { useMemo } from 'react';
import * as THREE from 'three';
function Roof({ width, depth, variant }: { width: number; depth: number; variant: number }) {
  const geometry = useMemo(() => {
    if (variant !== 0) return undefined;
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, width * 0.27);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    g.translate(0, 0, -depth / 2);
    return g;
  }, [width, depth, variant]);
  return variant === 2 ? (
    <mesh position={[0, 0.2, 0]} castShadow>
      <boxGeometry args={[width, 0.5, depth]} />
      <meshStandardMaterial color="#6f776e" />
    </mesh>
  ) : variant === 1 ? (
    <mesh
      position={[0, width * 0.125, 0]}
      rotation-y={Math.PI / 4}
      scale={[width / Math.SQRT2, width * 0.25, depth / Math.SQRT2]}
      castShadow
    >
      <coneGeometry args={[1, 1, 4]} />
      <meshStandardMaterial color="#826453" roughness={0.95} />
    </mesh>
  ) : (
    <mesh geometry={geometry} castShadow>
      <meshStandardMaterial color="#636c64" roughness={0.95} />
    </mesh>
  );
}
function House({
  b,
  index,
  onPick,
}: {
  b: (typeof buildingPositions)[number];
  index: number;
  onPick?: (p: Vector3D) => void;
}) {
  const selected = useAppStore((s) => s.selectedBuildingId === b.id),
    select = useAppStore((s) => s.selectBuilding);
  const { width: w, depth: d, height: h } = b.size;
  return (
    <group
      position={[b.position.x, 0, b.position.z]}
      rotation-y={b.rotation}
      onClick={(e) => {
        e.stopPropagation();
        if (onPick) onPick({ x: e.point.x, y: e.point.y, z: e.point.z });
        else select(b.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <boxGeometry args={[w + 1.6, 0.3, d + 1.6]} />
        <meshStandardMaterial color="#bebaa4" />
      </mesh>
      <mesh position={[0, h / 2 + 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial
          color={
            selected
              ? '#d5e5bb'
              : index % 3 === 0
                ? '#e8dfc8'
                : index % 3 === 1
                  ? '#d5cfb8'
                  : '#ece7d7'
          }
          roughness={1}
        />
      </mesh>
      <group position={[0, h + 0.3, 0]}>
        <Roof width={w + 1} depth={d + 1} variant={index % 3} />
      </group>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * (d / 2 + 0.025)]}>
          {[-0.29, 0.29].map((x) => (
            <mesh key={x} position={[w * x, h * 0.6, 0]}>
              <boxGeometry args={[w * 0.19, 1.4, 0.08]} />
              <meshStandardMaterial color="#6e8d8d" roughness={0.3} />
            </mesh>
          ))}
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[1.5, 2.6, 0.1]} />
            <meshStandardMaterial color="#75664f" />
          </mesh>
        </group>
      ))}
      {index % 3 === 1 && (
        <>
          <mesh position={[-w / 2 - 1, 0.9, d / 2 + 2.6]} castShadow>
            <boxGeometry args={[0.3, 1.8, 5]} />
            <meshStandardMaterial color="#d7cbb1" />
          </mesh>
          <mesh position={[w / 2 + 1, 0.9, d / 2 + 2.6]} castShadow>
            <boxGeometry args={[0.3, 1.8, 5]} />
            <meshStandardMaterial color="#d7cbb1" />
          </mesh>
        </>
      )}
      {b.type === 'public' && (
        <mesh position={[0, h - 0.6, d / 2 + 0.08]}>
          <boxGeometry args={[w * 0.45, 0.55, 0.1]} />
          <meshStandardMaterial color="#506e52" />
        </mesh>
      )}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.34, 0]}>
          <ringGeometry args={[Math.max(w, d) * 0.68, Math.max(w, d) * 0.73, 48]} />
          <meshBasicMaterial color="#335f42" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
export default function Buildings({ onPick }: { onPick?: (p: Vector3D) => void }) {
  const visible = useAppStore((s) => s.showBuildings);
  return visible ? (
    <group>
      {buildingPositions.map((b, i) => (
        <House key={b.id} b={b} index={i} onPick={onPick} />
      ))}
    </group>
  ) : null;
}
