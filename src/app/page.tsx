import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-lg text-center px-4">
        <h1 className="text-3xl font-bold mb-4">
          日報フィードバックシステム
        </h1>
        <p className="text-gray-600 mb-2">
          5軸評価モデルに基づく、マネージャー品質のフィードバックを自動生成
        </p>
        <div className="flex gap-2 justify-center mb-8 text-xs text-gray-400">
          <span>報告の質</span>
          <span>/</span>
          <span>アクション具体性</span>
          <span>/</span>
          <span>判断基準</span>
          <span>/</span>
          <span>検証設計</span>
          <span>/</span>
          <span>フェーズ認識</span>
        </div>
        <Link
          href="/report"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-black px-8 text-white font-medium hover:bg-gray-800 transition-colors"
        >
          日報を入力する
        </Link>
      </div>
    </div>
  );
}
