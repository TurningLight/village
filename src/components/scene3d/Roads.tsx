import { roads } from '../../data/villageLayout';
import { useAppStore } from '../../store/useAppStore';
export default function Roads() {
  const visible = useAppStore((s) => s.layers.roads);
  if (!visible) return null;
  return (
    <group>
      {roads.map((r) => {
        const [a, b] = r.points,
          length = Math.hypot(b.x - a.x, b.z - a.z);
        if (length < 0.1) return null;
        return (
          <mesh
            key={r.id}
            position={[(a.x + b.x) / 2, 0.015, (a.z + b.z) / 2]}
            rotation={[-Math.PI / 2, 0, -Math.atan2(b.x - a.x, b.z - a.z)]}
            receiveShadow
          >
            <planeGeometry args={[r.width, length]} />
            <meshStandardMaterial
              color={r.id.startsWith('lane') ? '#c7bba2' : '#9b9e90'}
              roughness={1}
            />
          </mesh>
        );
      })}
      {Array.from({ length: 20 }, (_, i) => (
        <mesh key={i} position={[0, 0.03, -50 + i * 5]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.18, 2]} />
          <meshBasicMaterial color="#e2dcc4" />
        </mesh>
      ))}
    </group>
  );
}
