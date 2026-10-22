import { Component, forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as THREE from 'three';
import { AlertTriangle, Check, Clock, Wrench } from 'lucide-react';
import Terrain from './Terrain';
import Buildings from './Buildings';
import Roads from './Roads';
import Farmlands from './Farmlands';
import Trees from './Trees';
import River from './River';
import StreetLights from './StreetLights';
import RenovationLayer from './RenovationLayer';
import { useAppStore } from '../../store/useAppStore';
import { useDesktopMarkerStore } from '../../store/useDesktopMarkerStore';
import { desktopIssueMarkerVisible } from '../../lib/desktopIssueMarkers';
import { DEMO_MODEL_ID, filteredIssues, issuesForModel } from '../../lib/issues';
import type { Vector3D } from '../../types';
import type { VillageSceneHandle } from './VillageScene';

class SceneBoundary extends Component<
  { children: ReactNode; onMap: () => void },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="space-failure" role="alert">
        <AlertTriangle size={30} />
        <h3>三维场景无法启动</h3>
        <p>请启用浏览器硬件加速，或使用二维地图继续查看。</p>
        <button onClick={this.props.onMap}>打开二维地图</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function ContextObserver({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }, [gl, onLost, onRestored]);
  return null;
}
const HOME = [115, 105, 125] as const;
function CameraRig({ command, serial }: { command: 'home' | 'top'; serial: number }) {
  const { camera, gl } = useThree(),
    control = useRef<OrbitControls>(null);
  const tween = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const revision = useAppStore((s) => s.selectionRevision);
  const buildingId = useAppStore((s) => s.selectedBuildingId),
    issueId = useAppStore((s) => s.selectedIssueId),
    planId = useAppStore((s) => s.currentRenovationId);
  const village = useAppStore((s) => s.village);
  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.1;
    c.minDistance = 12;
    c.maxDistance = 300;
    c.maxPolarAngle = Math.PI / 2 - 0.025;
    c.target.set(3, 0, 0);
    c.update();
    control.current = c;
    const stop = () => {
      tween.current = null;
    };
    c.addEventListener('start', stop);
    return () => {
      c.removeEventListener('start', stop);
      c.dispose();
      control.current = null;
    };
  }, [camera, gl]);
  useEffect(() => {
    tween.current = {
      position: new THREE.Vector3(...(command === 'home' ? HOME : [3, 175, 0.1])),
      target: new THREE.Vector3(3, 0, 0),
    };
  }, [command, serial]);
  useEffect(() => {
    const issue = issuesForModel(village?.issues ?? [], DEMO_MODEL_ID).find(
      (i) => i.id === issueId,
    );
    const position =
      issue?.location.local ??
      village?.buildings.find((b) => b.id === buildingId)?.location.local ??
      village?.renovations.find((p) => p.id === planId)?.location.local;
    if (position)
      tween.current = {
        position: planId
          ? new THREE.Vector3(position.x + 8, 50, position.z + 12)
          : new THREE.Vector3(position.x + 28, 35, position.z + 34),
        target: new THREE.Vector3(position.x, 0, position.z),
      };
  }, [revision, buildingId, issueId, planId, village]);
  useFrame((_, delta) => {
    const c = control.current;
    if (!c) return;
    if (tween.current) {
      const a = matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 1
        : 1 - Math.exp(-5 * Math.min(delta, 0.1));
      camera.position.lerp(tween.current.position, a);
      c.target.lerp(tween.current.target, a);
      if (camera.position.distanceTo(tween.current.position) < 0.05) tween.current = null;
    }
    c.update();
  });
  return null;
}
function SceneContent({ onPick, picking }: { onPick: (p: Vector3D) => void; picking: boolean }) {
  const night = useAppStore((s) => s.timeMode === 'night'),
    village = useAppStore((s) => s.village),
    show = useAppStore((s) => s.showIssues);
  const selected = useAppStore((s) => s.selectedIssueId),
    category = useAppStore((s) => s.filterCategory),
    status = useAppStore((s) => s.filterStatus);
  const plans = useAppStore((s) => s.showRenovations),
    planId = useAppStore((s) => s.currentRenovationId);
  const acknowledged = useDesktopMarkerStore((state) => state.acknowledged);
  const issues = filteredIssues(
    issuesForModel(village?.issues ?? [], DEMO_MODEL_ID),
    category,
    status,
  ).filter((issue) => desktopIssueMarkerVisible(issue, acknowledged));
  return (
    <>
      <color attach="background" args={[night ? '#17291f' : '#dce5d4']} />
      <fog attach="fog" args={[night ? '#17291f' : '#dce5d4', 180, 400]} />
      <hemisphereLight args={[night ? '#a4b8cb' : '#fff9eb', '#617c53', night ? 0.65 : 2.3]} />
      <directionalLight
        position={[50, 90, 35]}
        intensity={night ? 0.25 : 3.2}
        color={night ? '#a9c0de' : '#fff2d5'}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-far={240}
        shadow-bias={-0.0005}
      />
      <group
        onClick={(e) => {
          if (picking) {
            e.stopPropagation();
            onPick({ x: e.point.x, y: e.point.y, z: e.point.z });
          }
        }}
      >
        <Terrain />
        <Roads />
        <Farmlands />
        <River />
        <Trees />
        <Buildings onPick={picking ? onPick : undefined} />
        <StreetLights />
        <RenovationLayer />
      </group>
      {show &&
        issues.map((issue, i) => {
          const p = issue.location.local,
            Icon =
              issue.status === 'completed'
                ? Check
                : issue.status === 'processing'
                  ? Clock
                  : AlertTriangle;
          return (
            <group key={issue.id} position={[p.x, 0.2 + Math.max(0, p.y), p.z]}>
              {selected === issue.id && (
                <mesh rotation-x={-Math.PI / 2}>
                  <ringGeometry args={[3, 3.4, 48]} />
                  <meshBasicMaterial color="#dba15a" side={THREE.DoubleSide} />
                </mesh>
              )}
              <Html position={[0, 7, 0]} center zIndexRange={[12, 0]}>
                <button
                  className={`demo-marker ${issue.status} ${issue.severity} ${selected === issue.id ? 'selected' : ''}`}
                  aria-label={`定位问题：${issue.title}`}
                  title={issue.title}
                  onClick={() => useAppStore.getState().selectIssue(issue.id)}
                >
                  <Icon size={15} />
                  <span>{i + 1}</span>
                </button>
              </Html>
            </group>
          );
        })}
      {plans &&
        (village?.renovations ?? []).map((plan) => (
          <Html
            key={plan.id}
            position={[plan.location.local.x, 10, plan.location.local.z]}
            center
            zIndexRange={[13, 0]}
          >
            <button
              className={`demo-marker plan ${planId === plan.id ? 'selected' : ''}`}
              title={plan.name}
              aria-label={`查看方案：${plan.name}`}
              onClick={() => useAppStore.getState().setCurrentRenovation(plan.id)}
            >
              <Wrench size={17} />
            </button>
          </Html>
        ))}
    </>
  );
}
const DemoScene = forwardRef<
  VillageSceneHandle,
  { picking: boolean; onPick: (p: Vector3D) => void }
>(function DemoScene({ picking, onPick }, ref) {
  const [view, setView] = useState({ command: 'home' as 'home' | 'top', serial: 0 });
  const [ready, setReady] = useState(false),
    [lost, setLost] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      resetView: () => setView((v) => ({ command: 'home', serial: v.serial + 1 })),
      topView: () => setView((v) => ({ command: 'top', serial: v.serial + 1 })),
    }),
    [],
  );
  return (
    <div
      className={`demo-scene ${lost ? 'context-lost' : ''}`}
      data-viewer-state={ready ? 'ready' : 'loading'}
    >
      <SceneBoundary onMap={() => useAppStore.getState().setViewMode('2d')}>
        <Canvas
          shadows
          dpr={[1, 1.7]}
          camera={{ position: [...HOME], fov: 44, near: 0.1, far: 700 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
          onCreated={({ gl }) => {
            gl.domElement.setAttribute('aria-label', '青禾村三维场景');
            gl.domElement.tabIndex = 0;
            setReady(true);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ContextObserver onLost={() => setLost(true)} onRestored={() => setLost(false)} />
          <CameraRig command={view.command} serial={view.serial} />
          <SceneContent picking={picking} onPick={onPick} />
        </Canvas>
      </SceneBoundary>
      {lost && (
        <div className="space-failure" role="alert">
          <p>显卡连接中断，请刷新页面，或切换二维地图继续。</p>
          <button onClick={() => useAppStore.getState().setViewMode('2d')}>打开二维地图</button>
        </div>
      )}
      <div className="scene-caption">
        <strong>青禾村 Demo</strong>
        <span>程序化演示 · 1单位 ≈ 1米 · 非测绘数据</span>
      </div>
      <div className="scene-footnote">拖动旋转 · 滚轮缩放 · 右键平移 · 点击建筑或事件查看详情</div>
    </div>
  );
});
export default DemoScene;
