import { User } from 'firebase/auth'

export interface Scenario {
  id: string
  title: string
  content: string
  author: string
  authorId: string
  createdAt: Date
  updatedAt: Date
  tags: string[]
  isPublic: boolean
  aiSuggestions?: string[]
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  photoURL?: string
  createdAt: Date
  isAllowed: boolean
}

export interface AuthContextType {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  signInWithGoogle: () => Promise<void>
}

export interface EditorContextType {
  content: string
  setContent: (content: string) => void
  aiCompletion: (prompt: string) => Promise<string>
  saveScenario: (scenario: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  loading: boolean
}

/**
 * AIポリシーの読み取り権限
 * - allow: AIが全文参照OK
 * - mask: 参照OKだが出力時は伏字/要約のみ
 * - deny: 参照自体を禁止
 */
export type AIReadPolicy = 'allow' | 'mask' | 'deny'

/**
 * AIポリシーの引用権限
 * - allow: AIが外部へ原文引用して良い
 * - internal: 内部のみ引用可能
 * - deny: 引用禁止
 */
export type AIQuotePolicy = 'allow' | 'internal' | 'deny'

/**
 * AIポリシーの書き込み権限
 * AIがそのノードを編集/生成する可否
 */
export type AIWritePolicy = 'allow' | 'deny'

/**
 * AI実行環境のスコープ
 * - local: ローカルのみ許可
 * - cloud: クラウドも許可
 */
export type AIScope = 'local' | 'cloud'

/**
 * AIポリシー設定
 */
export interface AIPolicy {
  read?: AIReadPolicy
  quote?: AIQuotePolicy
  write?: AIWritePolicy
  scope?: AIScope[]
  until?: string | null // ISO 8601形式の日時文字列（例: "2025-12-31T23:59:59Z"）
}

/**
 * テキストドキュメント
 * タグはプロジェクトレベルで管理されるため、ここには含まれない
 */
export interface TextDocument {
  id: string
  path: string
  ai?: AIPolicy // このテキストに対するAIポリシー（プロジェクト全体のポリシーを上書き）
}

/**
 * タグドキュメント
 */
export interface TagDocument {
  path: string
  ai?: AIPolicy
}

/**
 * ライブラリドキュメント
 */
export interface LibraryDocument {
  path: string
  ai?: AIPolicy
}

/**
 * プロジェクトとテキストの関係を定義するJSON構造
 * 
 * 例:
 * {
 *   "id": "proj-001",
 *   "name": "プロジェクト名",
 *   "main": "プロジェクト名.md",
 *   "ai_policy": {
 *     "read": "allow",
 *     "quote": "internal",
 *     "write": "deny",
 *     "scope": ["local"],
 *     "until": null
 *   },
 *   "texts": [
 *     { "id": "t-intro", "path": "texts/intro.md", "ai": { "read": "allow" } },
 *     { "id": "t-qa", "path": "texts/qa.md", "ai": { "read": "deny" } }
 *   ],
 *   "tags": ["overview", "faq", "support", "internal"],
 *   "tag_docs": {
 *     "overview": { "path": "tags/overview.md" },
 *     "faq": { "path": "tags/faq.md", "ai": { "read": "allow", "quote": "allow" } }
 *   },
 *   "libraly": ["辞書"],
 *   "lib_docs": {
 *     "辞書": { "path": "tags/辞書.md" }
 *   }
 * }
 */
export interface ProjectTextRelation {
  id: string
  name: string
  main: string // メインのMarkdownファイル名（例: "プロジェクト名.md"）
  ai_policy: AIPolicy // プロジェクト全体のAIポリシー
  texts: TextDocument[] // テキストドキュメントの配列
  tags: string[] // プロジェクト全体で利用可能なタグのリスト
  tag_docs: Record<string, TagDocument> // タグごとのドキュメント
  libraly?: string[] // ライブラリのリスト（例: ["辞書"]）- JSONでは"libraly"のスペルを使用
  lib_docs?: Record<string, LibraryDocument> // ライブラリごとのドキュメント
}

/**
 * プロジェクト構造
 * スクリーンショットに基づく構造定義
 * 
 * プロジェクト
 * ├─ ユーザー作成領域
 * │  ├─ 本文群（texts: TextDocument[]）
 * │  │  ├─ プロジェクト内テキスト
 * │  │  └─ ユーザー辞書（本文群内の辞書参照）
 * │  ├─ 辞書（dictionary: DictionaryEntry[]）- プロジェクトレベル
 * │  ├─ タグ（tags: string[]）- プロジェクトレベル
 * │  ├─ あらすじ（synopsis: string）- プロジェクトレベル
 * │  ├─ note（note: string）- プロジェクトレベル
 * │  └─ など（その他のメタデータ）
 * └─ AI作成領域
 *    └─ AI生成テキスト（generatedTexts）
 */
export interface Project {
  id: string
  name: string
  authorId: string
  createdAt: Date
  updatedAt: Date
  isPublic: boolean
  
  // ユーザー作成領域
  userCreated: {
    // 本文群（複数のテキスト）
    texts: TextDocument[]
    // プロジェクトレベルのメタデータ
    dictionary: DictionaryEntry[] // 辞書（プロジェクトレベル）
    tags: string[] // タグ（プロジェクトレベル）
    synopsis?: string // あらすじ（プロジェクトレベル）
    note?: string // note（プロジェクトレベル）
    // その他のメタデータ
    [key: string]: any
  }
  
  // AI作成領域
  aiCreated: {
    // AI生成テキスト
    generatedTexts: Array<{
      id: string
      content: string
      prompt?: string
      createdAt: Date
      aiPolicy?: AIPolicy
    }>
  }
  
  // プロジェクト全体のAIポリシー
  ai_policy: AIPolicy
}

/**
 * 辞書エントリ（プロジェクトレベル）
 */
export interface DictionaryEntry {
  id: string
  term: string
  description: string
  createdAt: Date
}

