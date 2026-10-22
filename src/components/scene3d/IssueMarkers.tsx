import { useMemo, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDesktopMarkerStore } from '../../store/useDesktopMarkerStore';
import { desktopIssueMarkerVisible } from '../../lib/desktopIssueMarkers';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';
import * as THREE from 'three';

// 单个问题标记
function IssueMarker({
  issueId: _issueId,
  position,
  status,
  severity,
  title,
  isSelected,
  onClick,
}: {
  issueId: string;
  position: [number, number, number];
  status: 'pending' | 'processing' | 'completed';
  severity: 'low' | 'medium' | 'high';
  title: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const markerRef = useRef<THREE.Group>(null);

  // 根据状态决定颜色
  const markerColor = useMemo(() => {
    if (status === 'completed') return '#4CAF50'; // 绿色
    if (status === 'processing') return '#FF9800'; // 橙色
    if (severity === 'high') return '#F44336'; // 红色
    return '#FFA726'; // 浅橙色
  }, [status, severity]);

  // 动画效果 - 上下浮动
  useFrame((state) => {
    if (markerRef.current) {
      markerRef.current.position.y = position[1] + 5 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
    }
  });

  // 图标选择
  const Icon = useMemo(() => {
    if (status === 'completed') return CheckCircle;
    if (status === 'processing') return Clock;
    return AlertCircle;
  }, [status]);

  return (
    <group
      ref={markerRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'default';
      }}
    >
      {/* 垂直指示线 */}
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 5, 8]} />
        <meshBasicMaterial color={markerColor} transparent opacity={0.6} />
      </mesh>

      {/* 标记球体 */}
      <mesh>
        <sphereGeometry args={[hovered || isSelected ? 0.7 : 0.5, 16, 16]} />
        <meshBasicMaterial color={markerColor} />
      </mesh>

      {/* HTML标签 - 显示图标和标题 */}
      <Html
        center
        distanceFactor={10}
        style={{
          pointerEvents: 'none',
          transition: 'all 0.2s',
          opacity: hovered || isSelected ? 1 : 0.8,
          transform: `scale(${hovered || isSelected ? 1.2 : 1})`,
        }}
      >
        <div
          className="flex flex-col items-center bg-white rounded-lg shadow-lg p-2 border-2"
          style={{ borderColor: markerColor }}
        >
          <Icon size={20} color={markerColor} />
          {(hovered || isSelected) && (
            <div className="text-xs mt-1 text-center max-w-[120px] text-gray-800 font-medium">
              {title}
            </div>
          )}
        </div>
      </Html>

      {/* 选中高亮圈 */}
      {isSelected && (
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2, 2.5, 32]} />
          <meshBasicMaterial
            color={markerColor}
            side={THREE.DoubleSide}
            transparent
            opacity={0.5}
          />
        </mesh>
      )}

      {/* 脉冲动画 - 严重问题 */}
      {severity === 'high' && status === 'pending' && (
        <mesh>
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshBasicMaterial color={markerColor} transparent opacity={0.2} side={THREE.BackSide} />
        </mesh>
      )}
    </group>
  );
}

export default function IssueMarkers() {
  const village = useAppStore((state) => state.village);
  const selectedIssueId = useAppStore((state) => state.selectedIssueId);
  const selectIssue = useAppStore((state) => state.selectIssue);
  const showIssues = useAppStore((state) => state.showIssues);
  const filterCategory = useAppStore((state) => state.filterCategory);
  const filterStatus = useAppStore((state) => state.filterStatus);
  const acknowledged = useDesktopMarkerStore((state) => state.acknowledged);

  const handleIssueClick = useCallback(
    (id: string) => {
      if (selectedIssueId === id) {
        selectIssue(null);
      } else {
        selectIssue(id);
      }
    },
    [selectedIssueId, selectIssue],
  );

  // 筛选问题
  const filteredIssues = useMemo(() => {
    if (!village) return [];

    return village.issues.filter((issue) => {
      if (filterCategory !== 'all' && issue.category !== filterCategory) {
        return false;
      }
      if (filterStatus !== 'all' && issue.status !== filterStatus) {
        return false;
      }
      return desktopIssueMarkerVisible(issue, acknowledged);
    });
  }, [village, filterCategory, filterStatus, acknowledged]);

  if (!showIssues || !village) return null;

  return (
    <group>
      {filteredIssues.map((issue) => (
        <IssueMarker
          key={issue.id}
          issueId={issue.id}
          position={[issue.location.local.x, issue.location.local.y, issue.location.local.z]}
          status={issue.status}
          severity={issue.severity}
          title={issue.title}
          isSelected={selectedIssueId === issue.id}
          onClick={() => handleIssueClick(issue.id)}
        />
      ))}
    </group>
  );
}
