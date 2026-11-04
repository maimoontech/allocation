import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { useAppDispatch, useAppSelector } from "../../hooks/storeHooks";
import { setAuth } from "../../features/auth/authSlice";
import { useMemberChangePasswordMutation } from "../../features/member/memberApi";

/**
 * Password change for members.
 *
 * Doubles as the FORCED first-login screen. When `mustChangePassword` is set it cannot be
 * dismissed and offers no way out: every other member route answers 403
 * PASSWORD_CHANGE_REQUIRED until this succeeds (FR-017, FR-018). The same screen serves a
 * later voluntary change (FR-023), which is why the wording is conditional rather than two
 * near-identical pages.
 *
 * On success the server returns a FRESH token pair, because the member's current token
 * predates the change and is rejected from that moment on (FR-022). Storing it here is what
 * keeps the member signed in; without it they would be bounced to the login screen straight
 * after succeeding.
 */
/**
 * Pulls a displayable message out of an RTK Query rejection.
 *
 * Narrows from `unknown` rather than taking `any`, so a shape change surfaces at compile
 * time. The server's message is preferred because for a policy failure it names the rule
 * that was broken, which is the only thing that tells the member what to fix (FR-020).
 */
function errorMessageFrom(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;

    const data = record.data;
    if (typeof data === "object" && data !== null) {
      const message = (data as Record<string, unknown>).message;
      if (typeof message === "string" && message) return message;
    }

    if (typeof record.error === "string" && record.error) return record.error;
    if (typeof record.message === "string" && record.message) return record.message;
  }
  return fallback;
}

export function MemberChangePasswordPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const [changePassword, state] = useMemberChangePasswordMutation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isForced = Boolean(user?.mustChangePassword);
  const isBusy = state.isLoading;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword) {
      setError("Current password and new password are required.");
      return;
    }
    // Also checked on the server, which is authoritative (FR-019, FR-028). This is only to
    // save a round trip.
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    try {
      const result = await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword
      }).unwrap();

      dispatch(
        setAuth({
          token: result.token,
          refreshToken: result.refresh_token,
          user: result.user
        })
      );

      navigate("/member-profile", { replace: true });
    } catch (err: unknown) {
      // The server names the rule that failed, so it is shown verbatim (FR-020).
      setError(errorMessageFrom(err, "Failed to change password."));
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="text-2xl font-bold">
        {isForced ? "Set Your Password" : "Change Password"}
      </div>

      {isForced ? (
        <div className="rounded-input border border-warning bg-warning/5 p-3 text-sm text-warning">
          Before you can fill in your profile, please replace the password you were issued
          with one only you know.
        </div>
      ) : null}

      <Card>
        <form className="space-y-3" onSubmit={onSubmit}>
          {error ? (
            <div
              role="alert"
              className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
            >
              {error}
            </div>
          ) : null}

          <Input
            label={isForced ? "Password You Were Issued" : "Current Password"}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="New Password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="At least 12 characters, or at least 8 mixing upper case, lower case, digits or symbols."
          />
          <Input
            label="Confirm New Password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />

          <div className="flex gap-2">
            <Button type="submit" disabled={isBusy}>
              {isBusy ? "Saving..." : isForced ? "Set Password and Continue" : "Update Password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
