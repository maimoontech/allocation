import { useEffect, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Textarea } from "../../components/ui/Textarea";
import {
  useGetPendingPhotosQuery,
  useApprovePhotoMutation,
  useRejectPhotoMutation
} from "../../features/member/memberPhotoApprovalApi";
import { resolveApiUrl } from "../../features/api/api";
import { authStorage } from "../../utils/storage";
import { useAppSelector } from "../../hooks/storeHooks";

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/**
 * The pending photograph, fetched as a blob.
 *
 * The image endpoint requires a bearer token, and an `<img>` tag sends no Authorization
 * header, so a plain `src` would always 401. The token is attached here and the blob URL is
 * revoked on cleanup so it is not retained for the life of the document.
 */
function ApprovalPhoto({ photoId, alt }: { photoId: number; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const token = authStorage.getToken();
        const response = await fetch(
          resolveApiUrl(`member-photo-approvals/${photoId}/image`),
          { headers: token ? { authorization: `Bearer ${token}` } : undefined }
        );
        if (!response.ok) throw new Error("Could not load photo");
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/5 text-center text-xs text-textMuted">
        Photo unavailable
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-textMuted">
        Loading...
      </div>
    );
  }

  return <img src={url} alt={alt} className="h-full w-full object-cover" />;
}

export function MemberPhotoApprovalPage() {
  const user = useAppSelector((s) => s.auth.user);
  const { data: photos, isLoading, error, refetch } = useGetPendingPhotosQuery();
  const [approvePhoto, approveState] = useApprovePhotoMutation();
  const [rejectPhoto, rejectState] = useRejectPhotoMutation();

  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function onApprove(photoId: number) {
    setActionError(null);
    try {
      await approvePhoto({ photoId }).unwrap();
      setSelectedPhoto(null);
      refetch();
    } catch {
      setActionError("Failed to approve photo. Please try again.");
    }
  }

  async function onReject(photoId: number) {
    setActionError(null);
    try {
      await rejectPhoto({ photoId, reason: rejectReason || undefined }).unwrap();
      setSelectedPhoto(null);
      setRejectReason("");
      refetch();
    } catch {
      setActionError("Failed to reject photo. Please try again.");
    }
  }

  const items = photos ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-2xl font-bold">Member Photo Approvals</div>
        <div className="text-sm text-textMuted">
          {user?.role === "zonal_head"
            ? "Zone photos pending approval"
            : "All photos pending approval"}
        </div>
      </div>

      <Card>
        <div className="text-sm text-textMuted">
          Review member photos uploaded by new members. Approve or reject photos as required.
          {user?.role === "zonal_head" &&
            " As a Zonal Head, you can only approve photos of members in your zone."}
        </div>
      </Card>

      {error ? (
        <div
          role="alert"
          className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
        >
          Could not load pending photos.
        </div>
      ) : null}

      {actionError ? (
        <div
          role="alert"
          className="rounded-input border border-danger bg-danger/5 p-2 text-sm text-danger"
        >
          {actionError}
        </div>
      ) : null}

      <Card>
        {isLoading ? (
          <div className="p-2 text-sm text-textMuted">Loading photos...</div>
        ) : items.length === 0 ? (
          <div className="p-2 text-sm text-textMuted">No photos pending approval.</div>
        ) : (
          <div className="space-y-4">
            {items.map((photo) => (
              <div key={photo.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex gap-4">
                    <div className="h-32 w-32 overflow-hidden rounded border border-border">
                      <ApprovalPhoto
                        photoId={photo.id}
                        alt={`Photo of ${photo.member_name || photo.its_no}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold">{photo.member_name || "No name"}</div>
                      <div className="text-sm text-textMuted">ITS No: {photo.its_no}</div>
                      {photo.zone_name && (
                        <div className="text-sm text-textMuted">Zone: {photo.zone_name}</div>
                      )}
                      <div className="text-sm text-textMuted">
                        Uploaded: {formatDateTime(photo.created_at)}
                      </div>
                      <div className="text-xs text-textMuted">
                        {photo.content_type}, {Math.round(photo.byte_size / 1024)} KB
                        {photo.width && photo.height
                          ? `, ${photo.width} x ${photo.height}`
                          : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="primary"
                      disabled={approveState.isLoading || rejectState.isLoading}
                      onClick={() => onApprove(photo.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger"
                      disabled={approveState.isLoading || rejectState.isLoading}
                      onClick={() => setSelectedPhoto(photo.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>

                {selectedPhoto === photo.id && (
                  <div className="mt-4 space-y-2 rounded border border-border p-3">
                    <div className="text-sm font-semibold">Reject Photo</div>
                    <Textarea
                      label="Reason (optional)"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Provide reason for rejection..."
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        disabled={rejectState.isLoading}
                        onClick={() => onReject(photo.id)}
                      >
                        Confirm Reject
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={rejectState.isLoading}
                        onClick={() => {
                          setSelectedPhoto(null);
                          setRejectReason("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
