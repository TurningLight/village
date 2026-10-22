import { useEffect, useRef, useState } from 'react';
import { Bot, Info, LoaderCircle, Send, Square, Trash2, X } from 'lucide-react';
import {
  askGovernanceAssistant,
  type GovernanceChatMessage,
} from '../../services/governanceService';
import type { GovernanceAnswer, GovernanceOverview } from '../../types/governance';
import { EvidenceLinks, TextParagraphs } from './terminalText';
import { monthLabel, terminalDate } from './terminalFormat';

interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  answer?: GovernanceAnswer;
}

const quickQuestions = [
  '本月哪些地点的事件较集中？请列出依据。',
  '针对当前未办结事项，建议如何安排下一步工作？',
  '复盘本月办理工作，有哪些可以优化的做法？',
];

export default function AssistantDrawer({
  open,
  modelId,
  modelName,
  month,
  overview,
  onClose,
  onOpenIssue,
}: {
  open: boolean;
  modelId: string;
  modelName: string;
  month: string;
  overview: GovernanceOverview | null;
  onClose: () => void;
  onOpenIssue: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const nextId = useRef(0);
  const lastScrolledAnswer = useRef<number | null>(null);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const enabled = !!overview?.config.enabled;
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open) {
      dialog.current?.close();
      controller.current?.abort();
      controller.current = null;
    }
  }, [open]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    const container = conversation.current;
    if (!container || !dialog.current?.open) return;
    const latest = messages.at(-1);
    if (latest?.role === 'assistant' && lastScrolledAnswer.current !== latest.id) {
      const answer = container.querySelector<HTMLElement>(`[data-chat-entry="${latest.id}"]`);
      if (answer) {
        container.scrollTo({
          top:
            container.scrollTop +
            answer.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            24,
        });
        lastScrolledAnswer.current = latest.id;
      }
    } else if (pending) {
      container.scrollTo({ top: container.scrollHeight });
    } else if (!messages.length) {
      container.scrollTo({ top: 0 });
    }
  }, [messages, pending, error]);

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    setPending(false);
    setNotice('已取消本次分析，可以重新提问。');
  };
  const close = () => {
    controller.current?.abort();
    controller.current = null;
    setPending(false);
    onClose();
  };
  const newConversation = () => {
    cancel();
    setMessages([]);
    setInput('');
    setError('');
    setNotice('');
    textarea.current?.focus();
  };
  const ask = async (question = input) => {
    const value = question.trim();
    if (pending || !enabled || value.length < 2 || value.length > 1000) return;
    const requestController = new AbortController();
    controller.current = requestController;
    const history: GovernanceChatMessage[] = messages.slice(-8).map(({ role, content }) => ({
      role,
      content: content.slice(0, 3000),
    }));
    setMessages((current) => [...current, { id: ++nextId.current, role: 'user', content: value }]);
    setInput('');
    setError('');
    setNotice('');
    setPending(true);
    try {
      const answer = await askGovernanceAssistant(
        modelId,
        month,
        value,
        history,
        requestController.signal,
      );
      if (requestController.signal.aborted || controller.current !== requestController) return;
      setMessages((current) => [
        ...current,
        { id: ++nextId.current, role: 'assistant', content: answer.answer, answer },
      ]);
    } catch (cause) {
      if (requestController.signal.aborted || controller.current !== requestController) return;
      setError(cause instanceof Error ? cause.message : '本次分析失败，请重新提问。');
      setInput(value);
    } finally {
      if (controller.current === requestController) {
        controller.current = null;
        setPending(false);
      }
    }
  };
  const openEvidence = (id: string) => {
    close();
    onOpenIssue(id);
  };
  return (
    <dialog
      ref={dialog}
      className="gt-assistant"
      aria-labelledby="gt-assistant-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) {
          const bounds = dialog.current.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            close();
        }
      }}
    >
      <header className="gt-assistant-header">
        <div>
          <h2 id="gt-assistant-title">
            <Bot size={23} />
            村庄治理分析助手
          </h2>
          <p>
            {modelName} · {monthLabel(month)}
          </p>
        </div>
        <button
          className="gt-icon-button"
          type="button"
          onClick={close}
          aria-label="关闭治理分析助手"
          title="关闭"
        >
          <X size={20} />
        </button>
      </header>
      <div className="gt-assistant-meta">
        <span>阿里云百炼 · {overview?.config.model || '模型待连接'}</span>
        <span>数据截至 {overview ? terminalDate(overview.facts.generatedAt) : '读取中'}</span>
        <button type="button" onClick={newConversation} disabled={!messages.length && !pending}>
          <Trash2 size={14} />
          新对话
        </button>
      </div>
      <div className="gt-chat-scroll" ref={conversation} aria-busy={pending}>
        {!messages.length && (
          <div className="gt-chat-welcome">
            <h3>从已记录的事件出发，安排下一步治理工作。</h3>
            <p>
              助手引用当前村庄的事项与办理记录，分析集中地点并提出建议。事件数量不等同于事故发生率，建议需结合现场核实。
            </p>
            <div className="gt-quick-questions">
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={!enabled || pending}
                  onClick={() => void ask(question)}
                >
                  {question}
                </button>
              ))}
            </div>
            {!!overview?.facts.limitations.length && (
              <details className="gt-data-limitations">
                <summary>当前数据范围</summary>
                <ul>
                  {overview.facts.limitations.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        <div
          className="gt-chat-log"
          role="log"
          aria-label="治理分析对话"
          aria-live="polite"
          aria-relevant="additions"
        >
          {messages.map((message) => (
            <section
              key={message.id}
              data-chat-entry={message.id}
              className={`gt-chat-message gt-chat-${message.role}`}
            >
              <p className="gt-chat-author">
                {message.role === 'user'
                  ? '我的问题'
                  : `模型分析 · ${message.answer?.model || overview?.config.model || ''}`}
              </p>
              <TextParagraphs text={message.content} />
              {message.answer && (
                <>
                  <EvidenceLinks
                    ids={message.answer.evidenceIds}
                    evidence={overview?.facts.evidence || []}
                    onOpenIssue={openEvidence}
                  />
                  {!!message.answer.suggestions.length && (
                    <div className="gt-chat-suggestions">
                      <h4>可执行建议</h4>
                      <ol>
                        {message.answer.suggestions.map((suggestion, index) => (
                          <li key={index}>
                            <h5>{suggestion.title}</h5>
                            <p>{suggestion.action}</p>
                            <EvidenceLinks
                              ids={suggestion.evidenceIds}
                              evidence={overview?.facts.evidence || []}
                              onOpenIssue={openEvidence}
                            />
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {!!message.answer.limitations.length && (
                    <details className="gt-chat-limitations">
                      <summary>
                        <Info size={15} />
                        数据范围与判断边界
                      </summary>
                      <div>
                        {message.answer.limitations.map((item, index) => (
                          <p key={index}>{item}</p>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </section>
          ))}
          {pending && (
            <p className="gt-chat-pending" role="status">
              <LoaderCircle size={17} className="gt-spin" />
              正在核对事件依据并整理建议…
            </p>
          )}
        </div>
      </div>
      <form
        className="gt-chat-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        {!enabled && (
          <p className="gt-inline-error" role="status">
            治理模型尚未连接，请在电脑服务端 .env.local 配置百炼 API Key 并重启 API 服务。
          </p>
        )}
        {error && (
          <p className="gt-inline-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="gt-form-hint" role="status">
            {notice}
          </p>
        )}
        <label htmlFor="gt-chat-question" className="gt-sr-only">
          向村庄治理分析助手提问
        </label>
        <textarea
          ref={textarea}
          id="gt-chat-question"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="例如：本月村口的设施问题如何优先处理？"
          maxLength={1000}
          rows={3}
          disabled={!enabled || pending}
        />
        <div className="gt-chat-send-row">
          <span>模型建议供工作研判，原始记录可追溯。</span>
          {pending ? (
            <button className="gt-button gt-button-plain" type="button" onClick={cancel}>
              <Square size={14} />
              取消分析
            </button>
          ) : (
            <button
              className="gt-button gt-button-primary"
              type="submit"
              disabled={!enabled || input.trim().length < 2}
            >
              <Send size={16} />
              发送
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
