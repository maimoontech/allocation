import { useState, type FormEvent } from "react";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useChangePasswordMutation } from "../features/auth/authApi";

export function ChangePasswordPage() {
  const [changePassword, changePasswordState] = useChangePasswordMutation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isBusy = changePasswordState.isLoading;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setError("Current password and new password are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password must match.");
      return;
    }

    await changePassword({
      current_password: currentPassword,
      new_password: newPassword
    })
      .unwrap()
      .then(() => {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setSuccess("Password changed successfully.");
      })
      .catch((err: any) => {
        const message =
          err?.data?.message ||
          err?.error ||
          (typeof err?.message === "string" ? err.message : null) ||
          "Failed to change password.";
        setError(String(message));
      });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="text-2xl font-bold">Change Password</div>
      <Card>
        <form className="space-y-3" onSubmit={onSubmit}>
          {error ? <div className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger">{error}</div> : null}
          {success ? (
            <div className="rounded-input border border-secondary bg-secondary/5 p-2 text-sm text-secondary">{success}</div>
          ) : null}
          <Input
            label="Current Password"
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
              {isBusy ? "Saving..." : "Update Password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
