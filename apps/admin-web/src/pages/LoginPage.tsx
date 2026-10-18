import { storage } from "../lib/storage";
import { getAvailableEnvironments, setSelectedEnvironment } from "../lib/environmentSelection";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, CarFront, Globe2, LockKeyhole, MapPin, ShieldCheck, Smartphone, Users } from "lucide-react";
import { Button, Notice } from "../components/ui";
import { ApiError, completePasswordReset, passwordLogin, resendOtp, sendOtp, verifyOtp } from "../lib/api";
import type { Environment } from "../types";
import { LanguageSelector, useLanguage } from "../lib/i18n";
import { localizedErrorMessage } from "../lib/errorMessages.mjs";
import { OtpVerificationPage } from "./OtpVerificationPage";

export function LoginPage({ onAuthenticated, authMessage = "", configWarning = "", environment = "TEST", onLoginAttempt = () => {} }: { onAuthenticated: (token: string) => Promise<void>; authMessage?: string; configWarning?: string; environment?: Environment; onLoginAttempt?: () => void }) {
  const { t } = useLanguage();
  const [adminTypeSelection, setAdminTypeSelection] = useState<"SUPER_ADMIN" | "STATE_ADMIN">("STATE_ADMIN");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"credentials" | "otp">("credentials");
  const [actorId, setActorId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [resendAfter, setResendAfter] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [screen, setScreen] = useState<"login" | "reset-request" | "reset-verify">("login");
  const [resetMobile, setResetMobile] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [testOtpValue, setTestOtpValue] = useState("");

  useEffect(() => {
    if (stage !== "otp") return;
    const timer = window.setInterval(() => {
      setExpiresIn((value) => Math.max(0, value - 1));
      setResendAfter((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const countdown = useMemo(() => `${Math.floor(expiresIn / 60)}:${String(expiresIn % 60).padStart(2, "0")}`, [expiresIn]);

  const applyOtpChallenge = (data: any, preserveAttemptsOnMissing = false) => {
    const nextActor = String(data.actorId ?? "");
    const nextPurpose = String(data.purposeCode ?? "ADMIN.AUTH.NEW_DEVICE");
    if (!nextActor) throw new Error(t("errors.otpChallengeInvalid"));
    setActorId(nextActor);
    setPurpose(nextPurpose);
    setDeliveryMethod(String(data.deliveryMethod ?? ""));
    if (data.expiresInSeconds !== undefined && Number.isFinite(Number(data.expiresInSeconds)) && Number(data.expiresInSeconds) > 0) {
      setExpiresIn(Number(data.expiresInSeconds));
    } else if (!preserveAttemptsOnMissing) {
      setExpiresIn(0);
    }
    if (data.resendAfterSeconds !== undefined && Number.isFinite(Number(data.resendAfterSeconds)) && Number(data.resendAfterSeconds) >= 0) {
      setResendAfter(Number(data.resendAfterSeconds));
    } else if (!preserveAttemptsOnMissing) {
      setResendAfter(0);
    }
    const nextAttempts = data.attemptsRemaining;
    if (nextAttempts !== undefined && nextAttempts !== null && Number.isFinite(Number(nextAttempts))) {
      const normalized = Math.max(0, Number(nextAttempts));
      setAttemptsRemaining((current) => preserveAttemptsOnMissing && current !== null ? Math.min(current, normalized) : normalized);
    } else if (!preserveAttemptsOnMissing) {
      setAttemptsRemaining(null);
    }
    setOtp("");
    setStage("otp");
  };

  const login = async () => {
    if (configWarning) { setError(configWarning); return; }
    onLoginAttempt();
    setLoading(true);
    setError("");
    try {
      const data = await passwordLogin(identifier.trim(), password);
      if (data.requiresOtp) {
        if (environment === "TEST") throw new Error(t("auth.testOtpConfig"));
        applyOtpChallenge(data);
        return;
      }
      if (!data.token) throw new Error(t("errors.loginSessionMissing"));
      await onAuthenticated(String(data.token));
    } catch (e) {
      setError(localizedErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await verifyOtp(actorId, purpose, otp);
      if (!data.token) throw new Error(t("errors.loginSessionMissing"));
      await onAuthenticated(String(data.token));
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === "object") {
        const details = e.details as Record<string, unknown>;
        const nested = details.data && typeof details.data === "object" ? details.data as Record<string, unknown> : {};
        const nestedError = details.error && typeof details.error === "object" ? details.error as Record<string, unknown> : {};
        const remaining = details.attemptsRemaining ?? nested.attemptsRemaining ?? nestedError.attemptsRemaining;
        if (remaining !== undefined && remaining !== null && Number.isFinite(Number(remaining))) {
          setAttemptsRemaining(Math.max(0, Number(remaining)));
        }
      }
      setError(localizedErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (resendAfter > 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await resendOtp(actorId, purpose);
      // Resend responses can omit actorId/purpose because the backend derives them from the request.
      applyOtpChallenge({ ...data, actorId: data.actorId ?? actorId, purposeCode: data.purposeCode ?? purpose }, true);
      if (screen === "reset-verify") setTestOtpValue(environment === "TEST" ? String(data.testOtp ?? "") : "");
    } catch (e) {
      setError(localizedErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    const mobile = resetMobile.replace(/\D/g, "");
    if (mobile.length !== 10) {
      setError(t("auth.mobileRequired"));
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      const data = await sendOtp(mobile, "ADMIN.AUTH.PASSWORD_RESET");
      const nextActorId = String(data.actorId ?? data.mobile ?? mobile);
      applyOtpChallenge({ ...data, actorId: nextActorId, purposeCode: data.purposeCode ?? "ADMIN.AUTH.PASSWORD_RESET" });
      setResetMobile(mobile);
      setTestOtpValue(environment === "TEST" ? String(data.testOtp ?? "") : "");
      setNewPassword("");
      setConfirmNewPassword("");
      setScreen("reset-verify");
    } catch (e) {
      setError(localizedErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    if (newPassword !== confirmNewPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }
    if (!/^\d{4}$/.test(otp)) {
      setError(t("auth.invalidOtp"));
      return;
    }
    setLoading(true);
    setError("");
    setSuccessMessage("");
    try {
      await completePasswordReset(resetMobile, otp, newPassword);
      setScreen("login");
      setStage("credentials");
      setIdentifier(resetMobile);
      setPassword("");
      setOtp("");
      setActorId("");
      setPurpose("");
      setDeliveryMethod("");
      setExpiresIn(0);
      setResendAfter(0);
      setAttemptsRemaining(null);
      setNewPassword("");
      setConfirmNewPassword("");
      setTestOtpValue("");
      setSuccessMessage(t("auth.passwordResetSuccess"));
    } catch (e) {
      if (e instanceof ApiError && e.details && typeof e.details === "object") {
        const details = e.details as Record<string, unknown>;
        const nested = details.data && typeof details.data === "object" ? details.data as Record<string, unknown> : {};
        const remaining = details.attemptsRemaining ?? nested.attemptsRemaining;
        if (remaining !== undefined && remaining !== null && Number.isFinite(Number(remaining))) {
          setAttemptsRemaining(Math.max(0, Number(remaining)));
        }
      }
      setError(localizedErrorMessage(e, t));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="rx-login rx-auth-experience">
      <aside className="rx-auth-visual" aria-label="RideX Admin Portal introduction">
        <div className="rx-auth-visual-top">
          <div className="rx-logo rx-auth-logo">R<span>X</span></div>
          <div><strong>RideX</strong><span>Admin Portal</span></div>
          <span className="rx-auth-secure"><ShieldCheck size={14}/> Secure access</span>
        </div>
        <div className="rx-auth-hero-copy">
          <span className="rx-auth-kicker"><i/> OPERATIONS CONTROL CENTER</span>
          <h2>Manage.<br/>Operate. <em>Grow.</em></h2>
          <p>One workspace for rides, drivers, customers and the systems that keep RideX moving.</p>
        </div>
        <div className="rx-auth-route-art" aria-hidden="true">
          <div className="rx-auth-route-glow"/>
          <svg viewBox="0 0 520 210" role="presentation" focusable="false">
            <path className="rx-auth-route-line rx-auth-route-line-back" d="M-20 174 C80 125 96 198 184 147 S312 48 388 101 S466 135 550 30"/>
            <path className="rx-auth-route-line" d="M-20 174 C80 125 96 198 184 147 S312 48 388 101 S466 135 550 30"/>
            <circle cx="184" cy="147" r="6"/><circle cx="388" cy="101" r="6"/><circle cx="480" cy="78" r="5"/>
          </svg>
          <div className="rx-auth-floating-stat"><span className="rx-auth-stat-icon"><Activity size={16}/></span><span><strong>Control in one place</strong><small>Operational visibility</small></span><i/></div>
        </div>
        <div className="rx-auth-feature-grid">
          <div><CarFront/><span><strong>Ride operations</strong><small>Live trip workflows</small></span></div>
          <div><Users/><span><strong>People & access</strong><small>Drivers and customers</small></span></div>
          <div><MapPin/><span><strong>Routes & zones</strong><small>Location management</small></span></div>
        </div>
        <div className="rx-auth-visual-footer"><span>RIDEX ADMIN</span><span><i/> AUTHORIZED PERSONNEL ONLY</span></div>
      </aside>
      <div className="rx-login-card">
        <div className="rx-login-brand">
          <div className="rx-logo large">R<span>X</span></div>
          <div><strong>{t("app.name")}</strong><span>{t("app.secureConsole")}</span></div>
          <LanguageSelector />
        </div>

        <fieldset className="rx-admin-type-selector">
          <legend>{t("auth.environment", "Environment")}</legend>
          {(["TEST", "LIVE"] as const).map((option) => {
            const available = getAvailableEnvironments().includes(option);
            return (
              <label key={option}>
                <input
                  type="radio"
                  name="ridex-environment"
                  value={option}
                  checked={environment === option}
                  disabled={!available}
                  onChange={() => {
                    if (option === environment) return;
                    try {
                      storage.token = "";
                      setSelectedEnvironment(option);
                      window.location.reload();
                    } catch (cause) {
                      setError(cause instanceof Error
                        ? cause.message
                        : "Unable to switch environment.");
                    }
                  }}
                />
                {option}
              </label>
            );
          })}
          <small>
            {getAvailableEnvironments().includes("LIVE")
              ? "Switching environments clears the current session; sign in again."
              : "LIVE stays disabled until a valid HTTPS LIVE endpoint is configured."}
          </small>
        </fieldset>

        <div className="rx-login-copy">
          <div className="rx-eyebrow">{t("auth.controlCenter")}</div>
          <h1>{screen === "login" ? (stage === "credentials" ? t("auth.signIn") : t("auth.verifyLogin")) : screen === "reset-request" ? t("auth.resetRequestTitle") : t("auth.resetVerifyTitle")}</h1>
          <p>{screen === "login" ? (stage === "credentials" ? t("auth.credentialsHelp") : t("auth.otpHelp")) : screen === "reset-request" ? t("auth.resetRequestHelp") : t("auth.resetVerifyHelp")}</p>
        </div>

        {configWarning ? <Notice tone="warning">{configWarning}</Notice> : null}
        {authMessage ? <Notice tone="warning">{authMessage}</Notice> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {successMessage ? <Notice tone="success">{successMessage}</Notice> : null}

        {screen === "login" ? (
          stage === "credentials" ? (
            <div className="rx-form">
              <fieldset className="rx-admin-type-selector">
                <legend>{t("auth.adminType", "Admin type")}</legend>
                <label><input type="radio" name="admin-type-context" value="SUPER_ADMIN" checked={adminTypeSelection === "SUPER_ADMIN"} onChange={() => setAdminTypeSelection("SUPER_ADMIN")} /> {t("auth.superAdmin", "Super Admin")}</label>
                <label><input type="radio" name="admin-type-context" value="STATE_ADMIN" checked={adminTypeSelection === "STATE_ADMIN"} onChange={() => setAdminTypeSelection("STATE_ADMIN")} /> {t("auth.stateAdmin", "State-level Working Admin")}</label>
                <small>{t("auth.adminTypeNote", "Selection is an informational login context only. The backend determines your actual role, permissions and scope.")}</small>
              </fieldset>
              <label>{t("auth.identity")}
                <input autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder={t("auth.identityPlaceholder")} />
              </label>
              <label>{t("auth.password")}
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder={t("auth.passwordPlaceholder")} />
              </label>
              <Button loading={loading} disabled={!identifier || !password || loading || Boolean(configWarning)} onClick={login}>{t("auth.continue")} <ArrowRight size={16}/></Button>
              <Button variant="secondary" disabled={loading} onClick={() => { setScreen("reset-request"); setError(""); setSuccessMessage(""); }}>{t("auth.forgotPassword")}</Button>
            </div>
          ) : (
            <OtpVerificationPage
              actorId={actorId}
              purpose={purpose}
              deliveryMethod={deliveryMethod}
              countdown={countdown}
              attemptsRemaining={attemptsRemaining}
              otp={otp}
              setOtp={setOtp}
              resendAfter={resendAfter}
              expiresIn={expiresIn}
              loading={loading}
              onBack={() => { setStage("credentials"); setError(""); }}
              onResend={() => { void resend(); }}
              onVerify={() => { void verify(); }}
            />
          )
        ) : screen === "reset-request" ? (
          <div className="rx-form">
            <label>{t("auth.registeredMobile")}
              <input autoFocus inputMode="tel" autoComplete="tel" value={resetMobile} onChange={(e) => setResetMobile(e.target.value)} placeholder={t("auth.registeredMobilePlaceholder")} />
            </label>
            <Button loading={loading} disabled={loading || resetMobile.replace(/\D/g, "").length !== 10} onClick={() => { void requestPasswordReset(); }}>{t("auth.sendResetOtp")} <ArrowRight size={16}/></Button>
            <Button variant="secondary" disabled={loading} onClick={() => { setScreen("login"); setStage("credentials"); setError(""); }}>{t("auth.backToSignIn")}</Button>
          </div>
        ) : (
          <div className="rx-form">
            <div className="rx-login-context"><LockKeyhole size={17}/><div><strong>{resetMobile}</strong><span>{t("auth.resetVerifyHelp")}</span></div></div>
            {environment === "TEST" && testOtpValue ? <Notice tone="info">{t("auth.testOtpLabel")}: <strong>{testOtpValue}</strong></Notice> : null}
            <div className="rx-otp-meta">
              <span>{t("auth.expires")}: <strong aria-live="polite">{countdown}</strong></span>
              {attemptsRemaining !== null ? <span>{t("auth.attemptsRemaining")}: <strong>{attemptsRemaining}</strong></span> : null}
            </div>
            <label>{t("auth.adminOtp")}
              <input autoFocus inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder={t("auth.otpPlaceholder", "Enter verification code")} />
            </label>
            <label>{t("auth.newPassword")}
              <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder={t("auth.newPassword")} />
            </label>
            <label>{t("auth.confirmNewPassword")}
              <input type="password" autoComplete="new-password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder={t("auth.confirmNewPassword")} />
            </label>
            <div className="rx-inline-actions">
              <Button variant="secondary" disabled={loading} onClick={() => { setScreen("login"); setStage("credentials"); setError(""); setTestOtpValue(""); }}>{t("auth.backToSignIn")}</Button>
              <Button variant="secondary" disabled={resendAfter > 0 || loading || expiresIn === 0} onClick={() => { void resend(); }}>{resendAfter > 0 ? t("auth.resendIn").replace("{seconds}", String(resendAfter)) : t("auth.resendOtp")}</Button>
              <Button loading={loading} disabled={!/^\d{4}$/.test(otp) || !newPassword || !confirmNewPassword || loading || expiresIn === 0 || attemptsRemaining === 0} onClick={() => { void resetPassword(); }}>{t("auth.completePasswordReset")} <ArrowRight size={16}/></Button>
            </div>
          </div>
        )}

        <div className="rx-login-footer">
          <div><LockKeyhole size={14}/><span>{t("auth.backendSession")}</span></div>
          <div><Smartphone size={14}/><span>{t("auth.deviceIdentity")}</span></div>
          <div><Globe2 size={14}/><span>{t("auth.noPrivilegeSelector")}</span></div>
        </div>
      </div>
    </div>
  );
}
