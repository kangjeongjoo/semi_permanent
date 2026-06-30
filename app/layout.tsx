import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "반영구 시뮬레이터 — 눈썹·입술 미리보기",
  description:
    "내 사진에 반영구 눈썹·입술 디자인을 미리 입혀보고 AI 추천을 받는 개인용 시뮬레이터. 사진은 기기 밖으로 나가지 않습니다.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
