import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { fetchMe, logout, type PublicUser } from "../../lib/api";
import { assetUrl } from "../../lib/assetUrl";
import { CHARACTERS, type CharacterId } from "../../lib/characters";
import {
  deleteCustomRole,
  getChatRoleKeys,
  getUsageStats,
  readProfile,
  removeMemory,
  toggleChatRoleKey,
  upsertCustomRole,
  writeProfile,
  type CustomAiRole,
  type ProfileLocal,
  type UsageStats,
} from "../../lib/profileStore";
import {
  getCompanionStyle,
  setCompanionStyle,
} from "../../lib/replyLocalStore";
import { type CompanionStyleId } from "../../lib/replyTypes";
import {
  clearUserLlmConfig,
  maskApiKey,
  readUserLlmConfig,
  testUserLlmConnection,
  writeUserLlmConfig,
  type UserLlmConfig,
} from "../../lib/userLlmConfig";

type Props = {
  onLoggedOut: () => void;
};

type ProfilePage =
  | "root"
  | "edit-profile"
  | "ai-settings"
  | "companion-role"
  | "companion-style"
  | "companion-memory"
  | "create-role"
  | "custom-llm"
  | "usage"
  | "data-manage"
  | "help"
  | "privacy-policy"
  | "account-security"
  | "account-edit"
  | "privacy"
  | "notifications";

const STYLE_UI: {
  id: CompanionStyleId | "custom";
  label: string;
}[] = [
  { id: "gentle_quiet", label: "温柔陪伴" },
  { id: "playful_light", label: "活泼聊天" },
  { id: "warm_friend", label: "治愈倾听" },
  { id: "steady_ground", label: "理性建议" },
  { id: "custom", label: "自定义模式" },
];

function Row({
  label,
  meta,
  onClick,
}: {
  label: string;
  meta?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className="profile-row"
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="profile-row-label">{label}</span>
      {meta ? <span className="profile-row-meta">{meta}</span> : null}
    </button>
  );
}

function Section({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="profile-section">
      <div className="profile-section-head">
        <h3 className="profile-section-title">{title}</h3>
        {meta ? <span className="profile-section-meta">{meta}</span> : null}
      </div>
      <div className="profile-section-body">{children}</div>
    </section>
  );
}

function NavBar({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="profile-nav">
      <button type="button" className="profile-nav-back" onClick={onBack}>
        ← 返回
      </button>
      <h2 className="profile-nav-title">{title}</h2>
      <div className="profile-nav-right">{right ?? null}</div>
    </header>
  );
}

function emptyRoleDraft(): Omit<CustomAiRole, "id" | "createdAt"> {
  return {
    name: "",
    avatarUrl: "",
    intro: "",
    personality: "",
    speechStyle: "",
    relation: "",
    background: "",
    notes: "",
    sourceFileName: "",
    sourceText: "",
  };
}

/**
 * 「我的」— stack: Home ↔ leaves；AI 设置为中间层。
 */
export function ProfileModule({ onLoggedOut }: Props) {
  const [stack, setStack] = useState<ProfilePage[]>(["root"]);
  const page = stack[stack.length - 1] ?? "root";

  const [user, setUser] = useState<PublicUser | null>(null);
  const [profile, setProfile] = useState<ProfileLocal>(() => readProfile());
  const [style, setStyle] = useState<CompanionStyleId>(() =>
    getCompanionStyle()
  );
  const [stats, setStats] = useState<UsageStats>(() => getUsageStats());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const [draftNick, setDraftNick] = useState(profile.nickname);
  const [draftBio, setDraftBio] = useState(profile.bio);
  const [draftContactNote, setDraftContactNote] = useState("");

  const [roleDraft, setRoleDraft] = useState(emptyRoleDraft);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [llmCfg, setLlmCfg] = useState<UserLlmConfig>(() =>
    readUserLlmConfig()
  );
  const [llmEndpoint, setLlmEndpoint] = useState(llmCfg.endpoint);
  const [llmModel, setLlmModel] = useState(llmCfg.model);
  const [llmTemp, setLlmTemp] = useState(String(llmCfg.temperature));
  const [llmKeyInput, setLlmKeyInput] = useState("");
  const [llmBusy, setLlmBusy] = useState(false);
  const [llmMsg, setLlmMsg] = useState("");
  const [confirmClearLlm, setConfirmClearLlm] = useState(false);

  const push = useCallback((next: ProfilePage) => {
    setStack((s) => (s[s.length - 1] === next ? s : [...s, next]));
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  /** Home → AI Settings → leaf，保证返回先回到 AI 设置再回个人中心 */
  const openAiLeaf = useCallback((leaf: ProfilePage) => {
    setStack(["root", "ai-settings", leaf]);
  }, []);

  /** Re-read local stores whenever the visible page changes so parents stay fresh. */
  const refreshFromStores = useCallback(() => {
    setProfile(readProfile());
    setStyle(getCompanionStyle());
    setLlmCfg(readUserLlmConfig());
    setStats(getUsageStats(user?.createdAt));
  }, [user?.createdAt]);

  useEffect(() => {
    refreshFromStores();
  }, [page, refreshFromStores]);

  useEffect(() => {
    let cancelled = false;
    void fetchMe()
      .then(({ user: me }) => {
        if (cancelled) return;
        setUser(me);
        const p = readProfile(me.nickname);
        const synced =
          !p.nickname || p.nickname === "旅人"
            ? writeProfile({ nickname: me.nickname })
            : p;
        setProfile(synced);
        setDraftNick(synced.nickname);
        setDraftBio(synced.bio);
        setStats(getUsageStats(me.createdAt));
      })
      .catch(() => {
        if (!cancelled) setStats(getUsageStats());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function patchProfile(patch: Partial<ProfileLocal>) {
    const next = writeProfile(patch);
    setProfile(next);
    return next;
  }

  function openEdit() {
    setDraftNick(profile.nickname);
    setDraftBio(profile.bio);
    push("edit-profile");
  }

  function saveEdit() {
    const nick = draftNick.trim() || profile.nickname;
    patchProfile({ nickname: nick, bio: draftBio.trim() });
    pop();
  }

  function onAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        patchProfile({ avatarUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  function pickStyle(id: CompanionStyleId | "custom") {
    if (id === "custom") {
      patchProfile({ customMode: true });
      return;
    }
    patchProfile({ customMode: false });
    setStyle(id);
    setCompanionStyle(id);
  }

  function toggleChatRole(id: string) {
    setProfile(toggleChatRoleKey(id));
  }

  function openCreateRole(fromHome = false) {
    setEditingRoleId(null);
    setRoleDraft(emptyRoleDraft());
    if (fromHome) openAiLeaf("create-role");
    else push("create-role");
  }

  function openEditCustomRole(role: CustomAiRole) {
    setEditingRoleId(role.id);
    setRoleDraft({
      name: role.name,
      avatarUrl: role.avatarUrl,
      intro: role.intro,
      personality: role.personality,
      speechStyle: role.speechStyle,
      relation: role.relation,
      background: role.background,
      notes: role.notes,
      sourceFileName: role.sourceFileName || "",
      sourceText: role.sourceText || "",
    });
    push("create-role");
  }

  function openCustomLlm(fromHome = false) {
    const cfg = readUserLlmConfig();
    setLlmCfg(cfg);
    setLlmEndpoint(cfg.endpoint);
    setLlmModel(cfg.model);
    setLlmTemp(String(cfg.temperature));
    setLlmKeyInput("");
    setLlmMsg(
      cfg.lastTestMessage
        ? `${cfg.lastTestOk ? "上次测试成功" : "上次测试失败"}：${cfg.lastTestMessage}`
        : ""
    );
    if (fromHome) openAiLeaf("custom-llm");
    else push("custom-llm");
  }

  function onRoleAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setRoleDraft((d) => ({ ...d, avatarUrl: reader.result as string }));
      }
    };
    reader.readAsDataURL(file);
  }

  function onRoleSourceFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setRoleDraft((d) => ({
        ...d,
        sourceFileName: file.name,
        sourceText: text.slice(0, 20000),
      }));
    };
    reader.readAsText(file);
  }

  function saveCustomRole() {
    const name = roleDraft.name.trim();
    if (!name) return;
    const existing = editingRoleId
      ? profile.customRoles.find((r) => r.id === editingRoleId)
      : undefined;
    const role: CustomAiRole = {
      id: editingRoleId || `role_${Date.now().toString(36)}`,
      createdAt: existing?.createdAt || new Date().toISOString(),
      ...roleDraft,
      name,
    };
    const next = upsertCustomRole(role);
    const chatKeys = getChatRoleKeys(next);
    const withChat = chatKeys.includes(role.id)
      ? chatKeys
      : [...chatKeys, role.id];
    setProfile(
      writeProfile({
        ...next,
        chatRoleKeys: withChat,
        activeCompanionKey: role.id,
        companionDisplayName: role.name,
      })
    );
    setEditingRoleId(null);
    pop();
  }

  function saveLlm() {
    const temp = Number(llmTemp);
    const next = writeUserLlmConfig({
      endpoint: llmEndpoint,
      model: llmModel,
      temperature: Number.isFinite(temp) ? temp : 0.85,
      apiKeyPlain: llmKeyInput.trim() || undefined,
    });
    setLlmCfg(next);
    setLlmKeyInput("");
    setLlmMsg("已保存配置");
  }

  async function testLlm() {
    setLlmBusy(true);
    setLlmMsg("测试中…");
    const result = await testUserLlmConnection({
      endpoint: llmEndpoint,
      model: llmModel,
      apiKeyPlain: llmKeyInput.trim() || undefined,
    });
    setLlmCfg(readUserLlmConfig());
    setLlmMsg(result.message);
    setLlmBusy(false);
  }

  function clearLlm() {
    const empty = clearUserLlmConfig();
    setLlmCfg(empty);
    setLlmEndpoint("");
    setLlmModel("");
    setLlmTemp("0.85");
    setLlmKeyInput("");
    setLlmMsg("已清除模型配置");
    setConfirmClearLlm(false);
  }

  async function doLogout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logout();
      onLoggedOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "退出失败");
      setBusy(false);
      setConfirmLogout(false);
    }
  }

  const chatRoleKeys = getChatRoleKeys(profile);
  const userAvatar =
    profile.avatarUrl || assetUrl("assets/char-tuanzi.png?v=20260809d");

  function renderSubpage() {
    switch (page) {
      case "edit-profile":
        return (
          <div className="profile-page">
            <NavBar
              title="编辑资料"
              onBack={pop}
              right={
                <button
                  type="button"
                  className="profile-nav-save"
                  onClick={saveEdit}
                >
                  保存
                </button>
              }
            />
            <div className="profile-page-body">
              <div className="profile-edit-avatar">
                <img src={userAvatar} alt="" className="profile-avatar-lg" />
                <label className="profile-avatar-pick">
                  更换头像
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onAvatarChange}
                  />
                </label>
              </div>
              <label className="profile-field">
                <span>昵称</span>
                <input
                  value={draftNick}
                  maxLength={24}
                  onChange={(e) => setDraftNick(e.target.value)}
                  placeholder="你的名字"
                />
              </label>
              <label className="profile-field">
                <span>个性签名</span>
                <textarea
                  value={draftBio}
                  maxLength={120}
                  rows={3}
                  onChange={(e) => setDraftBio(e.target.value)}
                  placeholder="写一句想给自己看的话（可选）"
                />
              </label>
            </div>
          </div>
        );

      case "ai-settings":
        return (
          <div className="profile-page">
            <NavBar title="AI 设置" onBack={pop} />
            <div className="profile-page-body">
              <nav className="profile-menu">
                <Row
                  label="聊天角色"
                  meta={`已选 ${chatRoleKeys.length}`}
                  onClick={() => push("companion-role")}
                />
                <Row
                  label="陪伴风格"
                  onClick={() => push("companion-style")}
                />
                <Row
                  label="记忆管理"
                  meta={profile.longTermMemory ? "已开启" : "已关闭"}
                  onClick={() => push("companion-memory")}
                />
                <Row
                  label="创建角色"
                  onClick={() => openCreateRole(false)}
                />
                <Row
                  label="自定义大模型"
                  onClick={() => openCustomLlm(false)}
                />
              </nav>
            </div>
          </div>
        );

      case "companion-role":
        return (
          <div className="profile-page">
            <NavBar title="聊天角色" onBack={pop} />
            <div className="profile-page-body">
              <p className="profile-lead">
                选择参与日记下方评论的角色，可多选。
              </p>
              <ul className="profile-role-list">
                {(Object.keys(CHARACTERS) as CharacterId[]).map((id) => {
                  const c = CHARACTERS[id];
                  const active = chatRoleKeys.includes(id);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={
                          active
                            ? "profile-role-item is-active"
                            : "profile-role-item"
                        }
                        onClick={() => toggleChatRole(id)}
                        aria-pressed={active}
                      >
                        <span
                          className={
                            active
                              ? "profile-role-check is-on"
                              : "profile-role-check"
                          }
                          aria-hidden
                        />
                        <img
                          src={c.avatar}
                          alt=""
                          className="profile-avatar-sm"
                        />
                        <span>
                          <span className="profile-role-name">{c.name}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
                {profile.customRoles.map((r) => {
                  const active = chatRoleKeys.includes(r.id);
                  return (
                    <li key={r.id} className="profile-role-row">
                      <button
                        type="button"
                        className={
                          active
                            ? "profile-role-item is-active"
                            : "profile-role-item"
                        }
                        onClick={() => toggleChatRole(r.id)}
                        aria-pressed={active}
                      >
                        <span
                          className={
                            active
                              ? "profile-role-check is-on"
                              : "profile-role-check"
                          }
                          aria-hidden
                        />
                        <img
                          src={
                            r.avatarUrl ||
                            assetUrl("assets/char-tuanzi.png?v=20260809d")
                          }
                          alt=""
                          className="profile-avatar-sm"
                        />
                        <span>
                          <span className="profile-role-name">{r.name}</span>
                          <span className="profile-role-title">自定义</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="profile-memory-del"
                        onClick={() => openEditCustomRole(r)}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="profile-memory-del"
                        onClick={() => setProfile(deleteCustomRole(r.id))}
                      >
                        删除
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );

      case "companion-style":
        return (
          <div className="profile-page">
            <NavBar title="陪伴风格" onBack={pop} />
            <div className="profile-page-body">
              <ul className="profile-style-list">
                {STYLE_UI.map((s) => {
                  const active =
                    s.id === "custom"
                      ? profile.customMode
                      : !profile.customMode && style === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={
                          active
                            ? "profile-style-item is-active"
                            : "profile-style-item"
                        }
                        onClick={() => pickStyle(s.id)}
                      >
                        <span className="profile-style-label">{s.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {profile.customMode ? (
                <div className="profile-sliders">
                  <label className="profile-slider">
                    <span>说话方式</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={profile.speechSoftness}
                      onChange={(e) =>
                        patchProfile({
                          speechSoftness: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="profile-slider">
                    <span>性格特点</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={profile.personalityWarmth}
                      onChange={(e) =>
                        patchProfile({
                          personalityWarmth: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="profile-slider">
                    <span>主动程度</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={profile.proactivity}
                      onChange={(e) =>
                        patchProfile({
                          proactivity: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        );

      case "companion-memory":
        return (
          <div className="profile-page">
            <NavBar title="记忆管理" onBack={pop} />
            <div className="profile-page-body">
              <label className="profile-toggle">
                <span>长期记忆</span>
                <input
                  type="checkbox"
                  checked={profile.longTermMemory}
                  onChange={(e) =>
                    patchProfile({ longTermMemory: e.target.checked })
                  }
                />
              </label>
              <ul className="profile-memory-list">
                {profile.memories.length === 0 ? (
                  <li className="profile-empty">还没有记住的事。</li>
                ) : (
                  profile.memories.map((m) => (
                    <li key={m.id} className="profile-memory-item">
                      <p>{m.text}</p>
                      <button
                        type="button"
                        className="profile-memory-del"
                        onClick={() => setProfile(removeMemory(m.id))}
                      >
                        删除
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        );

      case "create-role":
        return (
          <div className="profile-page">
            <NavBar
              title={editingRoleId ? "编辑角色" : "创建角色"}
              onBack={() => {
                setEditingRoleId(null);
                pop();
              }}
              right={
                <button
                  type="button"
                  className="profile-nav-save"
                  onClick={saveCustomRole}
                  disabled={!roleDraft.name.trim()}
                >
                  保存
                </button>
              }
            />
            <div className="profile-page-body">
              <div className="profile-edit-avatar">
                {roleDraft.avatarUrl ? (
                  <img
                    src={roleDraft.avatarUrl}
                    alt=""
                    className="profile-avatar-lg"
                  />
                ) : (
                  <div className="profile-avatar-placeholder" />
                )}
                <label className="profile-avatar-pick">
                  上传头像
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={onRoleAvatar}
                  />
                </label>
              </div>
              {(
                [
                  ["name", "角色名称", "必填"],
                  ["intro", "角色介绍", ""],
                  ["personality", "性格", ""],
                  ["speechStyle", "说话方式", ""],
                  ["relation", "与用户的关系", ""],
                  ["background", "背景设定", ""],
                  ["notes", "其他自定义资料", ""],
                ] as const
              ).map(([key, label, ph]) => (
                <label key={key} className="profile-field">
                  <span>{label}</span>
                  {key === "name" || key === "relation" ? (
                    <input
                      value={roleDraft[key]}
                      maxLength={80}
                      placeholder={ph}
                      onChange={(e) =>
                        setRoleDraft((d) => ({ ...d, [key]: e.target.value }))
                      }
                    />
                  ) : (
                    <textarea
                      value={roleDraft[key]}
                      rows={2}
                      maxLength={800}
                      placeholder={ph}
                      onChange={(e) =>
                        setRoleDraft((d) => ({ ...d, [key]: e.target.value }))
                      }
                    />
                  )}
                </label>
              ))}
              <label className="profile-avatar-pick">
                上传角色设定文件（txt）
                <input
                  type="file"
                  accept=".txt,text/plain"
                  hidden
                  onChange={onRoleSourceFile}
                />
              </label>
              {roleDraft.sourceFileName ? (
                <p className="profile-lead">
                  已读取：{roleDraft.sourceFileName}
                </p>
              ) : null}
            </div>
          </div>
        );

      case "custom-llm":
        return (
          <div className="profile-page">
            <NavBar title="自定义大模型" onBack={pop} />
            <div className="profile-page-body">
              <label className="profile-field">
                <span>API Endpoint</span>
                <input
                  value={llmEndpoint}
                  onChange={(e) => setLlmEndpoint(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  autoComplete="off"
                />
              </label>
              <label className="profile-field">
                <span>API Key</span>
                <input
                  type="password"
                  value={llmKeyInput}
                  onChange={(e) => setLlmKeyInput(e.target.value)}
                  placeholder={
                    llmCfg.apiKeyHint
                      ? `已保存 ${maskApiKey(llmCfg.apiKeyHint)}，留空则不改`
                      : "sk-…"
                  }
                  autoComplete="new-password"
                />
              </label>
              <label className="profile-field">
                <span>Model 名称</span>
                <input
                  value={llmModel}
                  onChange={(e) => setLlmModel(e.target.value)}
                  placeholder="例如 hunyuan-turbos-latest"
                  autoComplete="off"
                />
              </label>
              <label className="profile-field">
                <span>Temperature</span>
                <input
                  value={llmTemp}
                  onChange={(e) => setLlmTemp(e.target.value)}
                  placeholder="0.85"
                  inputMode="decimal"
                />
              </label>
              <div className="profile-llm-actions">
                <button
                  type="button"
                  className="profile-primary"
                  onClick={saveLlm}
                >
                  保存配置
                </button>
                <button
                  type="button"
                  className="profile-primary"
                  onClick={() => void testLlm()}
                  disabled={llmBusy}
                >
                  {llmBusy ? "测试中…" : "测试连接"}
                </button>
                <button
                  type="button"
                  className="profile-btn-danger"
                  onClick={() => setConfirmClearLlm(true)}
                >
                  删除配置
                </button>
              </div>
              {llmMsg ? <p className="profile-lead">{llmMsg}</p> : null}
            </div>
          </div>
        );

      case "usage":
        return (
          <div className="profile-page">
            <NavBar title="使用记录" onBack={pop} />
            <div className="profile-page-body">
              <div className="profile-stats">
                <div className="profile-stat">
                  <strong>{stats.meetDays}</strong>
                  <span>陪伴天数</span>
                </div>
                <div className="profile-stat">
                  <strong>{stats.chatCount}</strong>
                  <span>聊天次数</span>
                </div>
                <div className="profile-stat">
                  <strong>{stats.companionMinutes}</strong>
                  <span>使用时长</span>
                </div>
              </div>
              <nav className="profile-menu">
                <Row
                  label="数据管理"
                  meta="清除 / 导出"
                  onClick={() => push("data-manage")}
                />
              </nav>
            </div>
          </div>
        );

      case "data-manage":
        return (
          <div className="profile-page">
            <NavBar title="数据管理" onBack={pop} />
            <div className="profile-page-body">
              <nav className="profile-menu">
                <Row label="清除聊天记录" meta="即将开放" />
                <Row label="导出聊天记录" meta="即将开放" />
                <Row label="数据权限管理" meta="即将开放" />
              </nav>
            </div>
          </div>
        );

      case "help":
        return (
          <div className="profile-page">
            <NavBar title="帮助与反馈" onBack={pop} />
            <div className="profile-page-body">
              <nav className="profile-menu">
                <Row label="产品反馈" meta="即将开放" />
                <Row label="常见问题" meta="即将开放" />
                <Row label="联系客服" meta="即将开放" />
              </nav>
            </div>
          </div>
        );

      case "privacy-policy":
        return (
          <div className="profile-page">
            <NavBar title="隐私政策" onBack={pop} />
            <div className="profile-page-body">
              <p className="profile-empty">正式隐私政策将在上线前补充。</p>
            </div>
          </div>
        );

      case "account-security":
        return (
          <div className="profile-page">
            <NavBar title="账号安全" onBack={pop} />
            <div className="profile-page-body">
              <nav className="profile-menu">
                <Row label="账号绑定" meta={user?.contact ?? "—"} />
                <Row
                  label="修改账号信息"
                  meta="去修改"
                  onClick={() => push("account-edit")}
                />
              </nav>
            </div>
          </div>
        );

      case "account-edit":
        return (
          <div className="profile-page">
            <NavBar title="修改账号信息" onBack={pop} />
            <div className="profile-page-body">
              <p className="profile-lead">
                当前绑定：{user?.contact ?? "—"}
              </p>
              <label className="profile-field">
                <span>备注（本地预留）</span>
                <input
                  value={draftContactNote}
                  maxLength={40}
                  onChange={(e) => setDraftContactNote(e.target.value)}
                />
              </label>
            </div>
          </div>
        );

      case "privacy":
        return (
          <div className="profile-page">
            <NavBar title="隐私设置" onBack={pop} />
            <div className="profile-page-body">
              <label className="profile-toggle">
                <span>探索模式中隐藏部分日记摘要</span>
                <input
                  type="checkbox"
                  checked={profile.privacyHideExplore}
                  onChange={(e) =>
                    patchProfile({ privacyHideExplore: e.target.checked })
                  }
                />
              </label>
            </div>
          </div>
        );

      case "notifications":
        return (
          <div className="profile-page">
            <NavBar title="通知设置" onBack={pop} />
            <div className="profile-page-body">
              <label className="profile-toggle">
                <span>日记提醒</span>
                <input
                  type="checkbox"
                  checked={profile.notifyDiary}
                  onChange={(e) =>
                    patchProfile({ notifyDiary: e.target.checked })
                  }
                />
              </label>
              <label className="profile-toggle">
                <span>信件到达提醒</span>
                <input
                  type="checkbox"
                  checked={profile.notifyLetter}
                  onChange={(e) =>
                    patchProfile({ notifyLetter: e.target.checked })
                  }
                />
              </label>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="profile-stack">
      <div
        className="profile-panel"
        hidden={page !== "root"}
        aria-hidden={page !== "root"}
      >
        <button
          type="button"
          className="profile-header"
          onClick={openEdit}
          aria-label="编辑个人资料"
        >
          <img src={userAvatar} alt="" className="profile-avatar-lg" />
          <div className="profile-header-text">
            <h1 className="profile-name">{profile.nickname}</h1>
            <p className="profile-companion-days">
              {profile.bio.trim()
                ? profile.bio.trim()
                : "点击编辑资料，写下签名"}
            </p>
          </div>
        </button>

        <Section title="账号">
          <nav className="profile-menu" aria-label="账号">
            <Row
              label="账号安全"
              onClick={() => push("account-security")}
            />
            <Row label="隐私设置" onClick={() => push("privacy")} />
            <Row label="通知设置" onClick={() => push("notifications")} />
          </nav>
        </Section>

        <Section title="使用管理">
          <nav className="profile-menu" aria-label="使用管理">
            <Row
              label="使用记录"
              onClick={() => push("usage")}
            />
            <Row
              label="数据管理"
              onClick={() => push("data-manage")}
            />
          </nav>
        </Section>

        <Section title="AI 设置">
          <nav className="profile-menu" aria-label="AI 设置">
            <Row
              label="聊天角色"
              meta={`已选 ${chatRoleKeys.length}`}
              onClick={() => openAiLeaf("companion-role")}
            />
            <Row
              label="陪伴风格"
              onClick={() => openAiLeaf("companion-style")}
            />
            <Row
              label="记忆管理"
              meta={profile.longTermMemory ? "已开启" : "已关闭"}
              onClick={() => openAiLeaf("companion-memory")}
            />
            <Row
              label="创建角色"
              onClick={() => openCreateRole(true)}
            />
            <Row
              label="自定义大模型"
              onClick={() => openCustomLlm(true)}
            />
          </nav>
        </Section>

        <Section title="更多">
          <nav className="profile-menu" aria-label="更多">
            <Row label="帮助与反馈" onClick={() => push("help")} />
            <Row label="隐私政策" onClick={() => push("privacy-policy")} />
          </nav>
        </Section>

        <button
          type="button"
          className="profile-logout"
          onClick={() => setConfirmLogout(true)}
          disabled={busy}
        >
          退出登录
        </button>
        {error ? (
          <p className="profile-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {page !== "root" ? (
        <div className="profile-stack-layer">{renderSubpage()}</div>
      ) : null}

      {confirmLogout ? (
        <div className="profile-confirm" role="dialog" aria-modal="true">
          <div className="profile-confirm-sheet">
            <p className="profile-confirm-title">要退出登录吗？</p>
            <p className="profile-confirm-desc">
              本地日记与信件仍会留在这台设备上。
            </p>
            <div className="profile-confirm-actions">
              <button
                type="button"
                className="profile-confirm-cancel"
                onClick={() => setConfirmLogout(false)}
                disabled={busy}
              >
                再想想
              </button>
              <button
                type="button"
                className="profile-confirm-ok"
                onClick={() => void doLogout()}
                disabled={busy}
              >
                {busy ? "退出中…" : "退出"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmClearLlm ? (
        <div className="profile-confirm" role="dialog" aria-modal="true">
          <div className="profile-confirm-sheet">
            <p className="profile-confirm-title">删除大模型配置？</p>
            <p className="profile-confirm-desc">
              删除后需重新填写 Endpoint 与 API Key，才能再用自定义模型。
            </p>
            <div className="profile-confirm-actions">
              <button
                type="button"
                className="profile-confirm-cancel"
                onClick={() => setConfirmClearLlm(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="profile-confirm-ok"
                onClick={clearLlm}
              >
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
