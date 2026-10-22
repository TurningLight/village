import { streetLightPositions } from '../../data/villageLayout';
import { useAppStore } from '../../store/useAppStore';
export default function StreetLights() {
  const night = useAppStore((s) => s.timeMode === 'night'),
    visible = useAppStore((s) => s.layers.facilities);
  const repaired = useAppStore(
    (s) =>
      s.showRenovations &&
      s.currentRenovationId === 'renovation-001' &&
      s.renovationMode === 'after',
  );
  if (!visible) return null;
  return (
    <group>
      {streetLightPositions.map((p, i) => {
        const on = night && (i !== 8 || repaired);
        return (
          <group
            key={i}
            position={[p.x, 0, p.z]}
            userData={{ facilityId: `light-${i}`, working: i !== 8 || repaired }}
          >
            <mesh position={[0, 2.6, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.13, 5.2, 6]} />
              <meshStandardMaterial color="#5b655a" />
            </mesh>
            <mesh position={[0.45, 5.2, 0]}>
              <boxGeometry args={[1.2, 0.15, 0.5]} />
              <meshStandardMaterial color="#465246" />
            </mesh>
            <mesh position={[0.8, 5.08, 0]}>
              <boxGeometry args={[0.55, 0.12, 0.4]} />
              <meshStandardMaterial
                color={on ? '#fff1c1' : '#c5c5a5'}
                emissive="#ffe4a5"
                emissiveIntensity={on ? 3 : 0}
              />
            </mesh>
            {on && (
              <pointLight
                position={[0.8, 4.8, 0]}
                intensity={75}
                distance={20}
                decay={2}
                color="#ffe2a0"
              />
            )}
          </group>
        );
      })}
    </group>
  );
}
