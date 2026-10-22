import { squareArea, facilities, renovationSite } from '../../data/villageLayout';
import { useAppStore } from '../../store/useAppStore';
export function Bench({ position = [0, 0, 0] }: { position?: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[2.5, 0.2, 0.7]} />
        <meshStandardMaterial color="#8d7152" />
      </mesh>
      <mesh position={[0, 1.1, -0.35]} castShadow>
        <boxGeometry args={[2.5, 0.6, 0.12]} />
        <meshStandardMaterial color="#8d7152" />
      </mesh>
      {[-0.9, 0.9].map((x) => (
        <mesh key={x} position={[x, 0.35, 0]}>
          <boxGeometry args={[0.15, 0.7, 0.6]} />
          <meshStandardMaterial color="#566056" />
        </mesh>
      ))}
    </group>
  );
}
export function SmallTree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.12, 0.2, 2.2, 6]} />
        <meshStandardMaterial color="#8b7856" />
      </mesh>
      <mesh position={[0, 3, 0]} castShadow>
        <icosahedronGeometry args={[1.6, 1]} />
        <meshStandardMaterial color="#698858" />
      </mesh>
    </group>
  );
}
export default function RenovationLayer() {
  const visible = useAppStore((s) => s.layers.facilities),
    id = useAppStore((s) => s.currentRenovationId),
    after = useAppStore((s) => s.showRenovations && s.renovationMode === 'after');
  if (!visible) return null;
  const squareAfter = after && id === 'renovation-002',
    wasteAfter = after && id === 'renovation-003';
  const square = squareArea.center,
    waste = facilities.find((f) => f.kind === 'waste')!.location.local;
  return (
    <group>
      <group
        position={[square.x, 0.05, square.z]}
        userData={{ renovation: 'renovation-002', after: squareAfter }}
      >
        <mesh rotation-x={-Math.PI / 2} receiveShadow>
          <planeGeometry args={[squareArea.width, squareArea.depth]} />
          <meshStandardMaterial color={squareAfter ? '#d5d1ba' : '#b2ac92'} />
        </mesh>
        {squareAfter ? (
          <>
            {[-4, 4].map((x) => (
              <Bench key={x} position={[x, 0, 1.6]} />
            ))}
            <SmallTree position={[-5, 0, -2]} />
            <SmallTree position={[5, 0, -2]} />
            {[-2, 0, 2].map((x) => (
              <mesh key={x} position={[x, 0.04, 0]} rotation-x={-Math.PI / 2}>
                <planeGeometry args={[0.06, 7]} />
                <meshBasicMaterial color="#ece8d4" />
              </mesh>
            ))}
          </>
        ) : (
          <mesh position={[3, 0.4, 1]} rotation-z={0.3}>
            <boxGeometry args={[2, 0.4, 0.7]} />
            <meshStandardMaterial color="#847660" />
          </mesh>
        )}
      </group>
      <group
        position={[waste.x, 0, waste.z]}
        userData={{ renovation: 'renovation-003', after: wasteAfter }}
      >
        <mesh position={[0, 0.08, 0]} receiveShadow>
          <boxGeometry args={[7, 0.16, 4]} />
          <meshStandardMaterial color={wasteAfter ? '#cacbb4' : '#a59778'} />
        </mesh>
        {(wasteAfter ? [-2, -0.7, 0.7, 2] : [-1, 1]).map((x, i) => (
          <mesh
            key={i}
            position={[x, 0.8, wasteAfter ? 0 : i % 2 ? 0.7 : -0.7]}
            rotation-z={wasteAfter ? 0 : i % 2 ? 0.2 : -0.2}
            castShadow
          >
            <boxGeometry args={[1, 1.5, 1]} />
            <meshStandardMaterial
              color={wasteAfter ? ['#66875c', '#688a9b', '#a2865a', '#8e6963'][i] : '#7d8068'}
            />
          </mesh>
        ))}
        {wasteAfter ? (
          <>
            <mesh position={[0, 2.8, -1.4]} castShadow>
              <boxGeometry args={[7, 0.2, 1.4]} />
              <meshStandardMaterial color="#5a7057" />
            </mesh>
            {[-3, 3].map((x) => (
              <mesh key={x} position={[x, 1.4, -1.6]} castShadow>
                <boxGeometry args={[0.14, 2.8, 0.14]} />
                <meshStandardMaterial color="#5a7057" />
              </mesh>
            ))}
            <SmallTree position={[4, 0, 0]} />
          </>
        ) : (
          Array.from({ length: 9 }, (_, i) => (
            <mesh
              key={i}
              position={[-3 + (i % 4) * 1.5, 0.25, 1.3 + Math.floor(i / 4) * 0.7]}
              rotation-y={i}
            >
              <dodecahedronGeometry args={[0.35 + (i % 3) * 0.08, 0]} />
              <meshStandardMaterial color={i % 2 ? '#d2c5a5' : '#858570'} />
            </mesh>
          ))
        )}
      </group>
      <Bench position={[10, 0, -48]} />
      <mesh
        position={[renovationSite.center.x, 0.02, renovationSite.center.z]}
        rotation-x={-Math.PI / 2}
      >
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color="#ac9d79" />
      </mesh>
    </group>
  );
}
