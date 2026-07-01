// 업로드 이미지 전처리 — HEIC/HEIF(아이폰 기본 포맷)를 브라우저에서 JPEG로 변환.
// 변환은 기기 내에서 수행되며 외부로 전송되지 않는다.

function isHeic(file: File): boolean {
  return (
    /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  );
}

// 표시·합성 가능한 Blob으로 변환 (HEIC면 JPEG로, 아니면 원본 그대로)
export async function toDisplayableBlob(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}
