"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  listWorkflowTemplates,
  getWorkflowTemplate,
  executeWorkflowSync,
  executeWorkflowAsync,
  createExecutionStream,
  type WorkflowTemplate,
  type WorkflowTemplateListItem,
  type WorkflowExecution,
  type StepDef,
  type StepResult,
  type StepStatus,
} from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ==================== 工具函数 ====================

/** 步骤类型 → 中文标签 + 图标 */
const STEP_TYPE_LABELS: Record<string, string> = {
  chat: "💬 对话",
  log_analysis: "📋 日志分析",
  agent_diagnosis: "🤖 Agent 诊断",
  rag_query: "📚 RAG 检索",
};

/** 执行状态 → 样式 */
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  running:
    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 animate-pulse",
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  skipped:
    "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
};

const STATUS_ICONS: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  success: "✅",
  failed: "❌",
  skipped: "⏭️",
};

/** Kahn 算法：将步骤按 DAG 层级分组，同层无依赖可并行 */
function computeLevels(steps: StepDef[]): StepDef[][] {
  const stepMap = new Map(steps.map((s) => [s.id, s]));
  const inDegree = new Map(steps.map((s) => [s.id, s.depends_on.length]));
  const successors = new Map(steps.map((s) => [s.id, [] as string[]]));
  for (const s of steps) {
    for (const dep of s.depends_on) {
      const list = successors.get(dep);
      if (list) list.push(s.id);
    }
  }

  const queue: string[] = steps
    .filter((s) => (inDegree.get(s.id) ?? 0) === 0)
    .map((s) => s.id);
  const levels: StepDef[][] = [];
  const completed = new Set<string>();

  while (queue.length > 0) {
    const levelIds = [...queue];
    queue.length = 0;
    levels.push(levelIds.map((id) => stepMap.get(id)!));
    for (const id of levelIds) {
      completed.add(id);
      for (const succ of successors.get(id) || []) {
        const deg = (inDegree.get(succ) ?? 1) - 1;
        inDegree.set(succ, deg);
        if (deg === 0) queue.push(succ);
      }
    }
  }

  return levels;
}

/** 从步骤 input_mapping 中提取 $input.xxx 引用，返回用户需要填写的字段名 */
function extractInputKeys(steps: StepDef[]): string[] {
  const keys = new Set<string>();
  const regex = /\$input\.(\w+)/g;
  for (const step of steps) {
    const json = JSON.stringify(step.input_mapping);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(json)) !== null) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

/** 按字段名推荐行数和占位符 */
function fieldMeta(key: string): { rows: number; placeholder: string } {
  if (/log/i.test(key)) {
    return {
      rows: 6,
      placeholder: "粘贴日志内容...",
    };
  }
  if (/description|error|desc/i.test(key)) {
    return {
      rows: 3,
      placeholder: "描述异常信息...",
    };
  }
  if (/question|query/i.test(key)) {
    return {
      rows: 2,
      placeholder: "输入问题...",
    };
  }
  return { rows: 2, placeholder: `输入 ${key}...` };
}

// ==================== 组件 ====================

export default function WorkflowPage() {
  // 模板列表
  const [templates, setTemplates] = useState<WorkflowTemplateListItem[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templatesError, setTemplatesError] = useState("");

  // 选中模板
  const [selectedId, setSelectedId] = useState("");
  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  // 输入表单
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  // 执行
  const [asyncMode, setAsyncMode] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execution, setExecution] = useState<WorkflowExecution | null>(null);
  const [execError, setExecError] = useState("");

  // SSE
  const sseRef = useRef<EventSource | null>(null);

  // ==================== 加载模板列表 ====================
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await listWorkflowTemplates();
        if (!cancelled) {
          setTemplates(data.templates);
          // 默认选中第一个
          if (data.templates.length > 0) {
            setSelectedId(data.templates[0].id);
          }
        }
      } catch {
        if (!cancelled) setTemplatesError("无法加载模板列表，请确认后端已启动");
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ==================== 选中模板变化时加载详情 ====================
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setTemplateLoading(true);
    setTemplate(null);
    setExecution(null);
    setExecError("");
    setInputValues({});

    async function load() {
      try {
        const t = await getWorkflowTemplate(selectedId);
        if (!cancelled) setTemplate(t);
      } catch {
        if (!cancelled) setExecError(`加载模板 "${selectedId}" 失败`);
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // ==================== 组件卸载时关闭 SSE ====================
  useEffect(() => {
    return () => {
      sseRef.current?.close();
    };
  }, []);

  // ==================== 执行 Workflow ====================
  const handleExecute = useCallback(async () => {
    if (!template) return;

    // 构建 input 对象
    const input: Record<string, unknown> = {};
    const inputKeys = extractInputKeys(template.steps);
    for (const key of inputKeys) {
      const val = inputValues[key]?.trim();
      if (!val) {
        setExecError(`请填写必填字段: ${key}`);
        return;
      }
      input[key] = val;
    }

    setExecuting(true);
    setExecution(null);
    setExecError("");

    if (asyncMode) {
      // --- 异步 + SSE ---
      try {
        const { execution_id } = await executeWorkflowAsync(template.id, input);

        // 创建 SSE 连接
        sseRef.current?.close();
        const es = createExecutionStream(
          execution_id,
          (exec) => {
            setExecution(exec);
            if (exec.status === "success" || exec.status === "failed") {
              setExecuting(false);
            }
          },
          () => {
            setExecuting(false);
          },
          (err) => {
            setExecError(err);
            setExecuting(false);
          }
        );
        sseRef.current = es;
      } catch {
        setExecError("提交 Workflow 失败，请稍后重试");
        setExecuting(false);
      }
    } else {
      // --- 同步 ---
      try {
        const result = await executeWorkflowSync(template.id, input);
        setExecution(result);
      } catch {
        setExecError("执行 Workflow 失败，请稍后重试");
      } finally {
        setExecuting(false);
      }
    }
  }, [template, inputValues, asyncMode]);

  // ==================== 渲染参数表单 ====================
  const inputKeys = template ? extractInputKeys(template.steps) : [];
  const levels = template ? computeLevels(template.steps) : [];

  // ==================== 渲染 ====================
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* 标题 */}
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-500 text-center">
          ⚙️ Workflow 编排
        </h1>

        {/* ===== 模板选择 ===== */}
        <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-3">
            选择模板
          </label>

          {templatesLoading ? (
            <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
          ) : templatesError ? (
            <p className="text-sm text-red-500">{templatesError}</p>
          ) : (
            <select
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 bg-white/80 backdrop-blur-sm text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-100"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.step_count} 步)
                </option>
              ))}
            </select>
          )}
        </div>

        {/* ===== 模板详情 + DAG 可视化 ===== */}
        {templateLoading ? (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700 space-y-3 animate-pulse">
            <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
            <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-2/3" />
            <div className="h-32 bg-slate-100 dark:bg-slate-700 rounded-xl" />
          </div>
        ) : template ? (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700 space-y-4">
            {/* 基本信息 */}
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {template.name}
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {template.description}
              </p>
            </div>

            {/* DAG 可视化 */}
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
                DAG 流程
              </h3>
              <div className="overflow-x-auto">
                <div className="flex items-start gap-3 min-w-fit">
                  {levels.map((level, li) => (
                    <div key={li} className="flex items-center gap-3">
                      {/* 层级步骤 */}
                      <div className="flex flex-col gap-2">
                        {level.map((step) => (
                          <div
                            key={step.id}
                            className={`px-3 py-2 rounded-xl border-2 text-sm font-medium whitespace-nowrap transition ${
                              step.id === template.output_step
                                ? "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/20"
                                : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-700"
                            }`}
                          >
                            <span className="text-xs text-slate-400 dark:text-slate-500 mr-1.5">
                              {STEP_TYPE_LABELS[step.type]?.split(" ")[0]}
                            </span>
                            <span className="text-slate-700 dark:text-slate-200">
                              {step.id}
                            </span>
                            {step.id === template.output_step && (
                              <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                ●
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* 层间箭头 */}
                      {li < levels.length - 1 && (
                        <div className="flex items-center text-slate-300 dark:text-slate-600 text-xl font-bold">
                          →
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 步骤详情列表 */}
            <details className="group">
              <summary className="text-xs font-semibold text-slate-400 uppercase tracking-wide cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 transition">
                步骤详情 ({template.steps.length} 步)
              </summary>
              <div className="mt-2 space-y-1.5">
                {template.steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-3 text-sm px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50"
                  >
                    <span className="text-xs w-16 shrink-0">
                      {STEP_TYPE_LABELS[step.type] || step.type}
                    </span>
                    <span className="font-mono text-slate-700 dark:text-slate-200">
                      {step.id}
                    </span>
                    {step.depends_on.length > 0 && (
                      <span className="text-xs text-slate-400">
                        ← {step.depends_on.join(", ")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : null}

        {/* ===== 输入参数 ===== */}
        {template && inputKeys.length > 0 && (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              输入参数
            </h3>

            {inputKeys.map((key) => {
              const { rows, placeholder } = fieldMeta(key);
              return (
                <div key={key}>
                  <label className="text-sm font-medium text-slate-600 dark:text-slate-300 block mb-1.5">
                    {key}
                  </label>
                  <textarea
                    rows={rows}
                    className="w-full border border-slate-200 rounded-xl p-3 bg-white/80 backdrop-blur-sm text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition resize-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                    value={inputValues[key] || ""}
                    onChange={(e) =>
                      setInputValues((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    placeholder={placeholder}
                    disabled={executing}
                  />
                </div>
              );
            })}

            {/* 执行模式 + 按钮 */}
            <div className="flex items-center justify-end gap-3 pt-1">
              {/* 异步模式开关 */}
              <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={asyncMode}
                  onChange={(e) => setAsyncMode(e.target.checked)}
                  disabled={executing}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-slate-600"
                />
                SSE 实时进度
              </label>

              <button
                onClick={handleExecute}
                disabled={
                  executing || templateLoading || inputKeys.length === 0
                }
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-medium text-sm hover:from-emerald-700 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-emerald-600/20 active:scale-95"
              >
                {executing && asyncMode
                  ? "执行中..."
                  : executing
                  ? "执行中..."
                  : "▶ 执行 Workflow"}
              </button>
            </div>

            {execError && (
              <p className="text-sm text-red-500 text-right">{execError}</p>
            )}
          </div>
        )}

        {/* ===== 执行结果 ===== */}
        {(execution || executing) && (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl border border-slate-200 p-5 shadow-sm dark:bg-slate-800/60 dark:border-slate-700 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                执行结果
              </h3>
              {execution && (
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                    STATUS_STYLES[execution.status]
                  }`}
                >
                  {STATUS_ICONS[execution.status]}{" "}
                  {execution.status === "pending"
                    ? "等待中"
                    : execution.status === "running"
                    ? "运行中"
                    : execution.status === "success"
                    ? "已完成"
                    : execution.status === "failed"
                    ? "失败"
                    : execution.status}
                </span>
              )}
            </div>

            {/* 步骤进度 */}
            {execution && Object.keys(execution.step_results).length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  步骤进度
                </p>
                {levels.flat().map((step) => {
                  const sr: StepResult | undefined =
                    execution.step_results[step.id];
                  if (!sr) return null;
                  return (
                    <StepProgressRow
                      key={step.id}
                      stepId={step.id}
                      stepType={step.type}
                      result={sr}
                    />
                  );
                })}
              </div>
            )}

            {/* 错误信息 */}
            {execution?.error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {execution.error}
                </p>
              </div>
            )}

            {/* 最终输出 */}
            {execution?.final_output != null && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                  最终输出
                </p>
                <div className="max-h-[500px] overflow-auto rounded-lg bg-slate-100 dark:bg-slate-900 p-4 text-sm leading-relaxed">
                  {typeof execution.final_output === "string" ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => (
                          <p className="mb-2 last:mb-0 text-slate-800 dark:text-slate-200">
                            {children}
                          </p>
                        ),
                        code: ({ className, children, ...props }) => {
                          const isInline = !className;
                          return isInline ? (
                            <code
                              className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded text-sm"
                              {...props}
                            >
                              {children}
                            </code>
                          ) : (
                            <pre className="bg-slate-200 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto my-2">
                              <code className={className} {...props}>
                                {children}
                              </code>
                            </pre>
                          );
                        },
                        strong: ({ children }) => (
                          <strong className="font-bold text-slate-900 dark:text-white">
                            {children}
                          </strong>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-4 mb-2">
                            {children}
                          </h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-base font-bold text-slate-700 dark:text-slate-200 mt-3 mb-1.5">
                            {children}
                          </h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-2 mb-1">
                            {children}
                          </h3>
                        ),
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside space-y-1 ml-2 mb-2 text-slate-700 dark:text-slate-300">
                            {children}
                          </ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside space-y-1 ml-2 mb-2 text-slate-700 dark:text-slate-300">
                            {children}
                          </ol>
                        ),
                      }}
                    >
                      {execution.final_output as string}
                    </ReactMarkdown>
                  ) : (
                    <pre className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono text-xs">
                      {JSON.stringify(execution.final_output, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ==================== 步骤进度行组件 ====================

function StepProgressRow({
  stepId,
  stepType,
  result,
}: {
  stepId: string;
  stepType: string;
  result: StepResult;
}) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[result.status] || STATUS_STYLES.pending;
  const icon = STATUS_ICONS[result.status] || STATUS_ICONS.pending;
  const typeLabel = STEP_TYPE_LABELS[stepType] || stepType;

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
      {/* 摘要行 */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
      >
        <span className="text-sm">{icon}</span>
        <span className="text-xs text-slate-400 w-20 shrink-0">
          {typeLabel}
        </span>
        <span className="font-mono text-sm text-slate-700 dark:text-slate-200 flex-1">
          {stepId}
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${style}`}
        >
          {result.status === "pending"
            ? "等待"
            : result.status === "running"
            ? "执行中"
            : result.status === "success"
            ? "成功"
            : result.status === "failed"
            ? "失败"
            : result.status === "skipped"
            ? "跳过"
            : result.status}
        </span>
        <span className="text-xs text-slate-300 dark:text-slate-600">
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t border-slate-100 dark:border-slate-700 px-3 py-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
          {/* 输入 */}
          {result.input != null && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                实际输入
              </p>
              <pre className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-lg p-2 overflow-x-auto max-h-32 whitespace-pre-wrap">
                {JSON.stringify(result.input, null, 2)}
              </pre>
            </div>
          )}

          {/* 输出 */}
          {result.output != null && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">
                输出
              </p>
              <div className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-lg p-2 overflow-x-auto max-h-48">
                {typeof result.output === "string" ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ children }) => (
                        <p className="mb-1 last:mb-0">{children}</p>
                      ),
                      code: ({ className: cls, children, ...props }) => {
                        const isInline = !cls;
                        return isInline ? (
                          <code
                            className="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded"
                            {...props}
                          >
                            {children}
                          </code>
                        ) : (
                          <pre className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg overflow-x-auto my-1">
                            <code className={cls} {...props}>
                              {children}
                            </code>
                          </pre>
                        );
                      },
                    }}
                  >
                    {result.output as string}
                  </ReactMarkdown>
                ) : (
                  <pre className="whitespace-pre-wrap font-mono">
                    {JSON.stringify(result.output, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* 错误 */}
          {result.error && (
            <div>
              <p className="text-[10px] font-semibold text-red-400 uppercase mb-1">
                错误
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                {result.error}
              </p>
            </div>
          )}

          {/* 时间 */}
          {result.started_at && (
            <p className="text-[10px] text-slate-400">
              {result.started_at}
              {result.finished_at ? ` → ${result.finished_at}` : " (进行中)"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
