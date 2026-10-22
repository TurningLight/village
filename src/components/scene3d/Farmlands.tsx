import { fields } from '../../data/villageLayout';
import { useAppStore } from '../../store/useAppStore';
export default function Farmlands() {
  const visible = useAppStore((s) => s.layers.fields);
  if (!visible) return null;
  return (
    <group>
      {fields.map((farm, i) => (
        <group key={farm.id} position={[farm.center.x, 0, farm.center.z]}>
          <mesh rotation-x={-Math.PI / 2} receiveShadow>
            <planeGeometry args={[farm.width + 0.7, farm.depth + 0.7]} />
            <meshStandardMaterial color="#b4a47e" />
          </mesh>
          {Array.from({ length: 10 }, (_, j) => (
            <mesh
              key={j}
              position={[-farm.width / 2 + ((j + 0.5) * farm.width) / 10, 0.12, 0]}
              receiveShadow
            >
              <boxGeometry args={[farm.width / 10 - 0.35, 0.25, farm.depth]} />
              <meshStandardMaterial
                color={['#819857', '#a3ae6c', '#7e9c63', '#b7b575'][i % 4]}
                roughness={1}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}
