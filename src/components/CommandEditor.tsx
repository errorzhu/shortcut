import { useState, useEffect } from "react";
import { Command, CommandType, CommandGroup } from "../types";
import { createCommand, expandTextVariables, getAvailableVariables } from "../commandStore";
import { ArrowLeft, Save, Info, Plus, Tag, FolderOpen, X } from "lucide-react";
import "./CommandEditor.css";

interface Props {
  command: Command | null;
  groups: CommandGroup[];
  onSave: (cmd: Command) => void;
  onCancel: () => void;
  defaultGroupId?: string;
}

const TYPE_OPTIONS: { value: CommandType; label: string; hint: string }[] = [
  { value: "date", label: "📅 日期", hint: "触发时输出当前日期/时间到剪贴板" },
  { value: "url", label: "🌐 网址", hint: "触发时在默认浏览器打开指定 URL" },
  { value: "app", label: "📦 应用", hint: "触发时启动指定的程序（填写完整路径）" },
  { value: "text", label: "📝 文本", hint: "触发时将预设文本复制到剪贴板" },
];

export default function CommandEditor({ command, groups, onSave, onCancel, defaultGroupId }: Props) {
  const isEdit = Boolean(command);

  const [trigger, setTrigger] = useState(command?.trigger ?? "-");
  const [type, setType] = useState<CommandType>(command?.type ?? "url");
  const [label, setLabel] = useState(command?.label ?? "");
  const [value, setValue] = useState(command?.value ?? "");
  const [description, setDescription] = useState(command?.description ?? "");
  const [groupId, setGroupId] = useState(command?.groupId ?? defaultGroupId ?? "default");
  const [tags, setTags] = useState<string[]>(command?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (command) {
      setTrigger(command.trigger);
      setType(command.type);
      setLabel(command.label);
      setValue(command.value);
      setDescription(command.description);
      setGroupId(command.groupId ?? "default");
      setTags(command.tags ?? []);
    } else {
      // 新建命令时，使用 defaultGroupId 或 "default"
      setGroupId(defaultGroupId ?? "default");
    }
  }, [command, defaultGroupId]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!trigger || trigger.length < 2) errs.trigger = "触发词至少 2 个字符";
    if (!trigger.startsWith("-")) errs.trigger = "触发词建议以 - 开头";
    if (!label.trim()) errs.label = "请输入命令名称";
    if (!value.trim()) errs.value = "请填写命令值";
    if (type === "url" && value && !value.startsWith("http"))
      errs.value = "网址需以 http:// 或 https:// 开头";
    return errs;
  };

  const handleSave = () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    console.log("[CommandEditor] handleSave - groupId:", groupId);
    const cmd = command
      ? { ...command, trigger, type, label, value, description, groupId, tags }
      : createCommand(trigger, type, label, value, description, groupId, tags);
    console.log("[CommandEditor] handleSave - cmd.groupId:", cmd.groupId);
    onSave(cmd);
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  const selectedTypeHint = TYPE_OPTIONS.find((t) => t.value === type)?.hint ?? "";

  const valuePlaceholders: Record<CommandType, string> = {
    date: "date（输出 YYYY-MM-DD）或 datetime（输出完整时间）",
    url: "https://www.example.com",
    app: "C:\\Program Files\\App\\app.exe",
    text: "输入要展开的文本内容，支持 {{date}} 等变量...",
    script: "powershell -Command ...",
  };

  return (
    <div className="editor-root">
      <div className="editor-header">
        <button className="back-btn" onClick={onCancel}>
          <ArrowLeft size={14} />
          <span>返回</span>
        </button>
        <h2 className="editor-title">
          {isEdit ? `编辑命令 · ${command?.trigger}` : "新建命令"}
        </h2>
      </div>

      <div className="editor-body">
        <div className="form-grid">
          {/* Trigger */}
          <div className="field">
            <label className="field-label">
              触发词 <span className="req">*</span>
            </label>
            <input
              className={`field-input mono ${errors.trigger ? "field-error" : ""}`}
              value={trigger}
              onChange={(e) => {
                setTrigger(e.target.value);
                setErrors((prev) => ({ ...prev, trigger: "" }));
              }}
              placeholder="-keyword"
              disabled={command?.builtIn}
            />
            {errors.trigger && <span className="err-msg">{errors.trigger}</span>}
            <span className="field-hint">在任意输入框中输入此词后按空格/回车触发</span>
          </div>

          {/* Label */}
          <div className="field">
            <label className="field-label">
              命令名称 <span className="req">*</span>
            </label>
            <input
              className={`field-input ${errors.label ? "field-error" : ""}`}
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setErrors((prev) => ({ ...prev, label: "" }));
              }}
              placeholder="例：打开百度"
            />
            {errors.label && <span className="err-msg">{errors.label}</span>}
          </div>

          {/* Type */}
          <div className="field field-full">
            <label className="field-label">命令类型</label>
            <div className="type-grid">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  className={`type-btn ${type === opt.value ? "type-active" : ""}`}
                  onClick={() => setType(opt.value)}
                  disabled={command?.builtIn}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="type-hint">
              <Info size={11} />
              <span>{selectedTypeHint}</span>
            </div>
          </div>

          {/* Group Selection */}
          <div className="field">
            <label className="field-label">
              <FolderOpen size={14} />
              所属分组
            </label>
            <select
              className="field-select"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div className="field">
            <label className="field-label">
              <Tag size={14} />
              标签
            </label>
            <div className="tag-input-row">
              <input
                className="field-input tag-input"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="输入标签后按回车"
              />
              <button className="tag-add-btn" onClick={addTag} type="button">
                <Plus size={14} />
              </button>
            </div>
            {tags.length > 0 && (
              <div className="tag-list">
                {tags.map((tag) => (
                  <span key={tag} className="tag-item">
                    {tag}
                    <button className="tag-remove-btn" onClick={() => removeTag(tag)}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Value */}
          <div className="field field-full">
            <label className="field-label">
              命令值 <span className="req">*</span>
            </label>
            {type === "text" ? (
              <div>
                <textarea
                  className={`field-textarea mono ${errors.value ? "field-error" : ""}`}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    setErrors((prev) => ({ ...prev, value: "" }));
                  }}
                  placeholder={valuePlaceholders[type]}
                  rows={4}
                />
                {/* Variable insertion buttons */}
                <div className="variable-buttons">
                  <span className="variable-label">插入变量：</span>
                  {getAvailableVariables().map((v) => (
                    <button
                      key={v.placeholder}
                      className="variable-btn"
                      onClick={() => {
                        setValue((prev) => prev + v.placeholder);
                      }}
                      title={`${v.label}: ${v.example}`}
                    >
                      <Plus size={10} />
                      {v.placeholder}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <input
                className={`field-input mono ${errors.value ? "field-error" : ""}`}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setErrors((prev) => ({ ...prev, value: "" }));
                }}
                placeholder={valuePlaceholders[type]}
                disabled={command?.builtIn && type === "date"}
              />
            )}
            {errors.value && <span className="err-msg">{errors.value}</span>}
          </div>

          {/* Description */}
          <div className="field field-full">
            <label className="field-label">备注说明</label>
            <input
              className="field-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选，描述这条命令的用途..."
            />
          </div>
        </div>

        {/* Preview */}
        <div className="preview-box">
          <div className="preview-label">预览</div>
          <div className="preview-content">
            <span className="preview-trigger">{trigger || "-?"}</span>
            <span className="preview-arrow">→</span>
            <span className="preview-action">
              {type === "date" && "📅 " + (new Date().toISOString().split("T")[0])}
              {type === "url" && "🌐 " + (value || "https://...")}
              {type === "app" && "📦 启动 " + (label || "应用")}
              {type === "text" && (
                <span className="text-preview">
                  <span className="preview-icon">📋</span>
                  <span className="preview-text-content">{expandTextVariables(value || "示例文本{{date}}")}</span>
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="editor-actions">
          <button className="cancel-btn" onClick={onCancel}>取消</button>
          <button className="save-btn" onClick={handleSave}>
            <Save size={13} />
            <span>保存命令</span>
          </button>
        </div>
      </div>

    </div>
  );
}