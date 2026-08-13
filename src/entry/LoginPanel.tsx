import { FormEvent, useEffect, useState } from "react";
import { login, register, setToken, type PublicUser } from "../lib/api";

type Props = {
  onSuccess: (user: PublicUser) => void;
  onBackIntro?: () => void;
};

export function LoginPanel({ onSuccess, onBackIntro }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [contactMsg, setContactMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const [formMsg, setFormMsg] = useState("");
  const [hint, setHint] = useState("");

  useEffect(() => {

    // Soft keyboard overlays — do not reflow / pan the form
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const prevOverflow = document.body.style.overflow;
    document.body.style.position = "fixed";
    document.body.style.top = "0";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    const shell = document.querySelector(".auth-shell") as HTMLElement | null;
    if (shell) shell.style.transform = "";

    const vk = (
      navigator as Navigator & {
        virtualKeyboard?: { overlaysContent: boolean };
      }
    ).virtualKeyboard;
    const prevVk = vk?.overlaysContent;
    if (vk) vk.overlaysContent = true;

    const killPan = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (shell) shell.style.transform = "";
    };

    const onFocusIn = () => {
      killPan();
      requestAnimationFrame(killPan);
    };
    const onVv = () => killPan();
    const onScroll = () => killPan();
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("scroll", onScroll, true);
    window.visualViewport?.addEventListener("resize", onVv);
    window.visualViewport?.addEventListener("scroll", onVv);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("scroll", onScroll, true);
      window.visualViewport?.removeEventListener("resize", onVv);
      window.visualViewport?.removeEventListener("scroll", onVv);
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      document.body.style.overflow = prevOverflow;
      if (shell) shell.style.transform = "";
      if (vk && prevVk !== undefined) vk.overlaysContent = prevVk;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setContactMsg("");
    setPasswordMsg("");
    setFormMsg("");
    setHint("");

    const nextContactMsg = !contact.trim() ? "请输入用户名" : "";
    let nextPasswordMsg = "";
    if (!password) {
      nextPasswordMsg = "请输入密码";
    } else if (password.length < 6) {
      nextPasswordMsg = "密码至少 6 位";
    }

    setContactMsg(nextContactMsg);
    setPasswordMsg(nextPasswordMsg);
    if (nextContactMsg || nextPasswordMsg) {
      return;
    }

    setLoading(true);
    try {
      const payload = { contact: contact.trim(), password };
      const result =
        mode === "register" ? await register(payload) : await login(payload);
      setToken(result.token);
      onSuccess(result.user);
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell login-clean-shell">
      <div className="entry-stage auth-stage login-clean-stage">
        <form className="login-clean-form" onSubmit={onSubmit}>
          <h1 className="login-clean-title">登录</h1>
          <p className="login-clean-sub">欢迎回来，记录今天的心情</p>

          <label className="login-clean-label" htmlFor="auth-contact">
            用户名
          </label>
          <input
            id="auth-contact"
            className="login-clean-input"
            name="contact"
            autoComplete="username"
            maxLength={80}
            placeholder="手机 / 邮箱"
            value={contact}
            onChange={(e) => {
              setContact(e.target.value);
              if (contactMsg) setContactMsg("");
            }}
            onFocus={() => window.scrollTo(0, 0)}
            disabled={loading}
            aria-describedby={contactMsg ? "auth-contact-msg" : undefined}
          />
          {contactMsg && (
            <p id="auth-contact-msg" className="login-clean-error" role="alert">
              {contactMsg}
            </p>
          )}

          <label className="login-clean-label" htmlFor="auth-password">
            密码
          </label>
          <input
            id="auth-password"
            className="login-clean-input"
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            maxLength={72}
            placeholder="至少 6 位"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordMsg) setPasswordMsg("");
            }}
            onFocus={() => window.scrollTo(0, 0)}
            disabled={loading}
            aria-describedby={passwordMsg ? "auth-password-msg" : undefined}
          />
          {passwordMsg && (
            <p
              id="auth-password-msg"
              className="login-clean-error"
              role="alert"
            >
              {passwordMsg}
            </p>
          )}

          <button
            type="submit"
            className="login-clean-submit"
            disabled={loading}
          >
            {loading
              ? "提交中…"
              : mode === "login"
                ? "登录"
                : "注册并登录"}
          </button>

          <button
            type="button"
            className="login-clean-switch"
            disabled={loading}
            onClick={() => {
              setMode((m) => {
                const next = m === "login" ? "register" : "login";
                setHint(next === "register" ? "当前为注册模式" : "");
                return next;
              });
              setContactMsg("");
              setPasswordMsg("");
              setFormMsg("");
            }}
          >
            {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
          </button>

          {(formMsg || hint) && (
            <p
              className="login-clean-status"
              role={formMsg ? "alert" : "status"}
            >
              {formMsg || hint}
            </p>
          )}
        </form>

        {onBackIntro && (
          <button type="button" className="login-clean-back" onClick={onBackIntro}>
            重新观看开场
          </button>
        )}
      </div>
    </div>
  );
}
