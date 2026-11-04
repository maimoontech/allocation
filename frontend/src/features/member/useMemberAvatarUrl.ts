import { useEffect, useState } from "react";
import { useGetMemberPhotoBlobQuery, useGetMemberProfileQuery } from "./memberApi";

/**
 * Object URL for the signed-in member's photograph, or null when there is none.
 *
 * The photo endpoint requires a bearer token, so it cannot be used as an `<img src>` directly.
 * The Blob comes from RTK Query (shared cache, refetched when a photo is uploaded or removed)
 * and is converted here, with the URL revoked on cleanup so the bytes are not retained for the
 * life of the document.
 *
 * `enabled` is false for every other role, which skips both requests entirely — an admin
 * opening the members list should not pay for a member-only profile call.
 */
export function useMemberAvatarUrl(enabled: boolean) {
  const { data: profile } = useGetMemberProfileQuery(undefined, { skip: !enabled });
  const { data: blob } = useGetMemberPhotoBlobQuery(undefined, {
    skip: !enabled || !profile?.has_photo
  });

  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);

  useEffect(() => {
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    setEntry({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // Keyed by the Blob itself, so a replaced photo never renders as the revoked URL of the
  // previous one in the render between the new fetch and this effect.
  return blob && entry?.blob === blob ? entry.url : null;
}
