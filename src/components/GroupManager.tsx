import { useState } from "react";
import { CommandGroup } from "../types";
import { Plus, X, Edit2, Trash2, FolderOpen } from "lucide-react";
import { createGroup, updateGroup, deleteGroup } from "../commandStore";
import "./GroupManager.css";

interface Props {
  groups: CommandGroup[];
  onGroupsChange: () => void;
}

const GROUP_COLORS = [
  "#60c8ff", "#7c6af7", "#3ddc84", "#ffd166", 
  "#ff9f7f", "#ff6b6b", "#a78bfa", "#34d399",
  "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4",
];

export default function GroupManager({ groups, onGroupsChange }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CommandGroup | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(GROUP_COLORS[0]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createGroup(newName.trim(), newColor);
    setNewName("");
    setNewColor(GROUP_COLORS[0]);
    onGroupsChange();
  };

  const handleUpdate = async () => {
    if (!editingGroup || !newName.trim()) return;
    await updateGroup({ ...editingGroup, name: newName.trim(), color: newColor });
    setEditingGroup(null);
    setNewName("");
    setNewColor(GROUP_COLORS[0]);
    onGroupsChange();
  };

  const handleDelete = async (group: CommandGroup) => {
    if (group.id === "default") return;
    if (!confirm(`确定要删除分组「${group.name}」吗？该分组下的命令将移至默认分组。`)) return;
    await deleteGroup(group.id);
    onGroupsChange();
  };

  const startEdit = (group: CommandGroup) => {
    setEditingGroup(group);
    setNewName(group.name);
    setNewColor(group.color);
  };

  const cancelEdit = () => {
    setEditingGroup(null);
    setNewName("");
    setNewColor(GROUP_COLORS[0]);
  };

  return (
    <>
      <button className="group-manager-btn" onClick={() => setShowModal(true)}>
        <FolderOpen size={14} />
        <span>管理分组</span>
      </button>

      {showModal && (
        <div className="group-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="group-modal" onClick={(e) => e.stopPropagation()}>
            <div className="group-modal-header">
              <h3>管理分组</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="group-modal-body">
              {/* Create/Edit Form */}
              <div className="group-form">
                <input
                  type="text"
                  className="group-input"
                  placeholder="分组名称"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <div className="group-color-picker">
                  {GROUP_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`color-dot ${newColor === color ? "active" : ""}`}
                      style={{ background: color }}
                      onClick={() => setNewColor(color)}
                    />
                  ))}
                </div>
                <div className="group-form-actions">
                  {editingGroup ? (
                    <>
                      <button className="btn-cancel" onClick={cancelEdit}>取消</button>
                      <button className="btn-save" onClick={handleUpdate}>保存</button>
                    </>
                  ) : (
                    <button className="btn-create" onClick={handleCreate} disabled={!newName.trim()}>
                      <Plus size={14} />
                      <span>创建分组</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Group List */}
              <div className="group-list">
                {groups.map((group) => (
                  <div key={group.id} className="group-item">
                    <div className="group-item-info">
                      <div className="group-color" style={{ background: group.color }} />
                      <span className="group-name">{group.name}</span>
                      {group.id === "default" && (
                        <span className="default-badge">默认</span>
                      )}
                    </div>
                    <div className="group-item-actions">
                      <button className="icon-btn" onClick={() => startEdit(group)} title="编辑">
                        <Edit2 size={14} />
                      </button>
                      {group.id !== "default" && (
                        <button className="icon-btn delete" onClick={() => handleDelete(group)} title="删除">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}