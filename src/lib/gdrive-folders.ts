/**
 * Google Drive folder map for the Winstone CRM archive.
 * Root: "Winstone CRM" in the company Google Drive.
 * These IDs are not secrets; access is still controlled by the Drive connection.
 */
export const DRIVE_ROOT_FOLDER_ID = "1CciCzRyqoZppF7oxkyK-D5XE2il5QyeN";

export const DRIVE_FOLDERS = {
  root: DRIVE_ROOT_FOLDER_ID,
  recordings: "1fuReXrRH9tkh9jOSpFwphJtBvXkLG7bM",
  recordings2026: "1W5bUNQrEqAUt6RC7zJBQ9l5Q8GlontrS",
  dailyExports: "1Z2rjlD5MCkiHWiLzixaHs1_Ugq-qSXFa",
  dailyExports2026: "1dqzGSy56FPaphqRTTxp_9Mb9OsCYyOCH",
  shiftSummaries: "1ySZgg7olHBjyp4T9Ov8PU8Z_xvCAbfl9",
  shiftSummaries2026: "13VT8L0ZTFgHjV1M5YaIm_Y2V2SdMqg92",
  leadImports: "1LMgRUQ8Tl2I0Vt7Aa3wkprf0HCia4f__",
  documents: "13hjp-gGSQjPWs3PZrnSMqUnWvF6LFO7u",
  androidApp: "1U1F_Iz1iaPX9uvuMQD24YwM_Suaen5aZ",
  audit: "1AKKDQCWwNCEKORn57rSx2ItuLZ3T_mFw",
} as const;

export type DriveFolderKey = keyof typeof DRIVE_FOLDERS;

export const DRIVE_FOLDER_LABELS: Record<DriveFolderKey, string> = {
  root: "Winstone CRM",
  recordings: "কল রেকর্ডিং",
  recordings2026: "কল রেকর্ডিং / ২০২৬",
  dailyExports: "দৈনিক এক্সপোর্ট",
  dailyExports2026: "দৈনিক এক্সপোর্ট / ২০২৬",
  shiftSummaries: "শিফট সারসংক্ষেপ",
  shiftSummaries2026: "শিফট সারসংক্ষেপ / ২০২৬",
  leadImports: "লিড ইমপোর্ট",
  documents: "ডকুমেন্ট ও সারসংক্ষেপ",
  androidApp: "এজেন্ট অ্যাপ",
  audit: "অডিট ও কমপ্লায়েন্স",
};

export function driveFolderUrl(id: string): string {
  return `https://drive.google.com/drive/folders/${id}`;
}
