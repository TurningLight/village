import { waterBodies } from '../../data/villageLayout';
import { useAppStore } from '../../store/useAppStore';
export default function River() {
  const visible = useAppStore((s) => s.layers.water);
  if (!visible) return null;
  return (
    <group>
      {waterBodies.flatMap((w) =>
        w.points.slice(1).map((b, i) => {
          const a = w.points[i],
            length = Math.hypot(b.x - a.x, b.z - a.z);
          return (
            <group
              key={i}
              position={[(a.x + b.x) / 2, 0.04, (a.z + b.z) / 2]}
              rotation-y={Math.atan2(b.x - a.x, b.z - a.z)}
            >
              <mesh rotation-x={-Math.PI / 2}>
                <planeGeometry args={[w.width + 1.6, length + 1]} />
                <meshStandardMaterial color="#b5ad91" />
              </mesh>
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.04, 0]}>
                <planeGeometry args={[w.width, length + 0.6]} />
                <meshStandardMaterial color="#83b6b9" roughness={0.24} metalness={0.18} />
              </mesh>
              {[0, 1, 2].map((j) => (
                <mesh
                  key={j}
                  position={[w.width / 2 + 0.6, 0.2, -length / 2 + 2 + j * 4]}
                  scale={[0.7, 0.4, 0.6]}
                >
                  <dodecahedronGeometry args={[0.7, 0]} />
                  <meshStandardMaterial color="#a7a89a" />
                </mesh>
              ))}
            </group>
          );
        }),
      )}
    </group>
  );
}
