import { createServerFn } from "@tanstack/react-start";

/**
 * Publishing a new build of the company phone app.
 *
 * IT uploads the APK they signed with the company keystore; the file replaces
 * the download served to the phones and a release row records the version, so
 * every phone's update check reports the new build truthfully. Nothing here
 * installs anything on a phone — Android only ever installs after the person
 * holding the phone confirms it.
 */

const MAX_APK_BYTES = 120 * 1024 * 1024;

function decodeBase64(input: string): Uint8Array {
  const clean = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export const listAppReleases = createServerFn({ method: "GET" })
  .inputValidator((input: { adminToken?: string | null }) => input)
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken);
    requireAuthority(caller);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: releases }, { data: devices }] = await Promise.all([
      supabaseAdmin
        .from("app_releases")
        .select("id, version_code, version_name, release_notes, is_mandatory, released_at")
        .order("version_code", { ascending: false })
        .limit(10),
      supabaseAdmin
        .from("agent_devices")
        .select("id, device_label, app_version, last_seen_at, status, revoked_at, profile_id")
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(200),
    ]);

    return {
      releases: releases ?? [],
      devices: (devices ?? []).map((device) => ({
        id: device.id,
        label: device.device_label,
        appVersion: device.app_version,
        lastSeenAt: device.last_seen_at,
        status: device.status,
      })),
      canWrite: !caller.readOnly,
    };
  });

export const publishAppRelease = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      adminToken?: string | null;
      versionCode: number;
      versionName: string;
      releaseNotes?: string | null;
      isMandatory?: boolean;
      fileBase64: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority, requireWrite } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken);
    requireAuthority(caller);
    requireWrite(caller);

    const versionCode = Math.trunc(Number(data.versionCode));
    const versionName = data.versionName.trim();
    if (!Number.isFinite(versionCode) || versionCode < 1) throw new Error("Version code invalid");
    if (versionName.length < 1) throw new Error("Version name required");

    const bytes = decodeBase64(data.fileBase64);
    if (bytes.byteLength === 0) throw new Error("অ্যাপ ফাইল খালি");
    if (bytes.byteLength > MAX_APK_BYTES) throw new Error("ফাইলটি ১২০ MB-এর চেয়ে বড়");
    // An APK is a ZIP archive: reject anything that is not, before it reaches the phones.
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new Error("এটি বৈধ APK ফাইল নয়");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("app_releases")
      .select("id")
      .eq("version_code", versionCode)
      .maybeSingle();
    if (existing) throw new Error(`Version code ${versionCode} আগেই প্রকাশিত হয়েছে`);

    const storagePath = "winstone-connect.apk";
    const { error: uploadError } = await supabaseAdmin.storage
      .from("app-downloads")
      .upload(storagePath, bytes, {
        contentType: "application/vnd.android.package-archive",
        upsert: true,
        cacheControl: "no-cache",
      });
    if (uploadError) throw new Error(`আপলোড ব্যর্থ: ${uploadError.message}`);

    // Hash the exact bytes that were just uploaded, so the public info endpoint
    // never has to read the build back. A failure here must not publish a stale
    // digest: the old row is dropped first, and the endpoint backfills instead.
    const { invalidatePublishedChecksum, storeApkChecksum } =
      await import("@/lib/apk-checksum.server");
    await invalidatePublishedChecksum();
    try {
      await storeApkChecksum(bytes);
    } catch {
      /* left unset on purpose — apk-info will compute it once on first request */
    }

    const { data: release, error: insertError } = await supabaseAdmin
      .from("app_releases")
      .insert({
        version_code: versionCode,
        version_name: versionName,
        storage_path: storagePath,
        release_notes: data.releaseNotes?.trim() || null,
        is_mandatory: data.isMandatory ?? false,
      })
      .select("id, version_code, version_name, released_at")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "app_release_published",
      entityType: "app_release",
      entityId: release.id,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      metadata: {
        version_code: versionCode,
        version_name: versionName,
        bytes: bytes.byteLength,
        mandatory: data.isMandatory ?? false,
      },
    });

    return { release, bytes: bytes.byteLength };
  });
