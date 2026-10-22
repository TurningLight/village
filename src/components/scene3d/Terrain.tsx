export default function Terrain() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.18, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color="#bfccb0" roughness={1} />
      </mesh>
      <mesh position={[4, -1.2, 0]} receiveShadow>
        <boxGeometry args={[202, 2, 150]} />
        <meshStandardMaterial color="#aabc98" roughness={1} />
      </mesh>
      {Array.from({ length: 16 }, (_, i) => (
        <mesh
          key={i}
          position={[-130 + i * 18, 5 + (i % 4) * 2, -125 - (i % 3) * 9]}
          scale={[22, 12 + (i % 4) * 4, 16]}
        >
          <icosahedronGeometry args={[1, 1]} />
          <meshStandardMaterial color={i % 2 ? '#9bad90' : '#a6b99b'} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}
