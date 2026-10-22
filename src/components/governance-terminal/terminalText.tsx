import type { ReactNode } from 'react';
import type { GovernanceEvidence } from '../../types/governance';

export function TextParagraphs({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`gt-prose ${className}`}>
      {text
        .split(/\n\s*\n/)
        .filter((line) => line.trim())
        .map((line, index) => (
          <p key={index}>{line.trim()}</p>
        ))}
    </div>
  );
}

export function EvidenceLinks({
  ids,
  evidence,
  onOpenIssue,
  prefix = '依据事件',
}: {
  ids: string[];
  evidence: GovernanceEvidence[];
  onOpenIssue: (id: string) => void;
  prefix?: ReactNode;
}) {
  if (!ids.length) return null;
  return (
    <div className="gt-evidence-links">
      <span>{prefix}</span>
      {[...new Set(ids)].map((id) => (
        <button key={id} type="button" onClick={() => onOpenIssue(id)}>
          {evidence.find((item) => item.id === id)?.title || `事件 ${id.slice(-6)}`}
        </button>
      ))}
    </div>
  );
}
