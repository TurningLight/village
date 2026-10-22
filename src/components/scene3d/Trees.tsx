import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import { treePositions } from '../../data/villageLayout';
export default function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null),
    crowns = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const dummy = new THREE.Object3D();
    treePositions.forEach((p, i) => {
      const height = 4 + (i % 5) * 0.5;
      dummy.position.set(p.x, height / 2, p.z);
      dummy.scale.set(0.25, height, 0.25);
      dummy.updateMatrix();
      trunks.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, height + 0.5, p.z);
      dummy.scale.set(2 + (i % 3) * 0.4, 2.5 + (i % 4) * 0.3, 2 + (i % 3) * 0.4);
      dummy.updateMatrix();
      crowns.current?.setMatrixAt(i, dummy.matrix);
      crowns.current?.setColorAt(i, new THREE.Color(['#577953', '#6c8d60', '#849665'][i % 3]));
    });
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) {
      crowns.current.instanceMatrix.needsUpdate = true;
      if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
    }
  }, []);
  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, treePositions.length]} castShadow>
        <cylinderGeometry args={[1, 1.2, 1, 6]} />
        <meshStandardMaterial color="#7e7055" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, treePositions.length]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
    </group>
  );
}
