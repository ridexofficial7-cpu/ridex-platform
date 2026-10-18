import { ArrowLeft, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui";
import { useLanguage } from "../lib/i18n";

export interface OtpVerificationPageProps {
  actorId: string;
  purpose: string;
  deliveryMethod: string;
  countdown: string;
  attemptsRemaining: number | null;
  otp: string;
  setOtp: (value: string) => void;
  resendAfter: number;
  expiresIn: number;
  loading: boolean;
  onBack: () => void;
  onResend: () => void;
  onVerify: () => void;
}

/** Dedicated OTP verification view. The parent retains the authentication/session state machine. */
export function OtpVerificationPage({ actorId, purpose, deliveryMethod, countdown, attemptsRemaining, otp, setOtp, resendAfter, expiresIn, loading, onBack, onResend, onVerify }: OtpVerificationPageProps) {
  const { t } = useLanguage();
  // The current RideX backend OTP contract is four digits. Keep the input
  // validation and Verify control aligned so a valid code can be submitted.
  const otpValid = /^\d{4}$/.test(otp);
  return <section className="rx-form rx-otp-verification-page" aria-labelledby="rx-otp-verification-title">
    <div className="rx-login-context"><ShieldCheck size={17}/><div><strong>{actorId}</strong><span>{t("auth.adminAccount", "Admin account")} · {purpose}</span></div></div>
    <div className="rx-otp-meta">
      <span>{t("auth.method")}: <strong>{deliveryMethod || "Configured by backend"}</strong></span>
      <span>{t("auth.expires")}: <strong aria-live="polite">{countdown}</strong></span>
      {attemptsRemaining !== null ? <span>{t("auth.attemptsRemaining")}: <strong>{attemptsRemaining}</strong></span> : null}
    </div>
    <label htmlFor="ridex-admin-otp">{t("auth.adminOtp")}
      <input id="ridex-admin-otp" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={4} pattern="[0-9]{4}" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder={t("auth.otpPlaceholder", "Enter 4-digit verification code")} aria-describedby="ridex-otp-help" aria-invalid={otp.length > 0 && !otpValid} />
    </label>
    <p id="ridex-otp-help" className="rx-muted">{t("auth.otpHelp")}</p>
    <div className="rx-inline-actions">
      <Button variant="secondary" onClick={onBack} disabled={loading}><ArrowLeft size={15}/>{t("auth.back")}</Button>
      <Button variant="secondary" disabled={resendAfter > 0 || loading || expiresIn === 0} loading={false} onClick={onResend}><RefreshCw size={15}/>{resendAfter > 0 ? t("auth.resendIn").replace("{seconds}", String(resendAfter)) : t("auth.resendOtp")}</Button>
      <Button loading={loading} disabled={!otpValid || loading || expiresIn === 0 || attemptsRemaining === 0} onClick={onVerify}>{t("auth.verifyAndSignIn")} <ArrowRight size={16}/></Button>
    </div>
  </section>;
}
