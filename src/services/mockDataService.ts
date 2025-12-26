import { ProjectTextRelation, DictionaryEntry } from '@/types'

/**
 * 後方互換性のためのScenario型（既存UIとの互換性を保つため）
 * 内部的にはProjectTextRelationに変換される
 */
export interface Scenario {
  id: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
  tags: string[]
  isPublic: boolean
  authorId: string
  dictionaryEntries?: DictionaryEntry[]
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  photoURL?: string
  createdAt: Date
  isAllowed: boolean
}

// Mock AI suggestions
export const mockAISuggestions = [
  "主人公は立ち上がり、決意を込めて言った。",
  "その時、不思議な光が現れて、状況を一変させた。",
  "彼女の心に新しい希望が芽生え始めていた。",
  "謎めいた影が近づいてくる。",
  "突然、雷鳴が轟き、空が暗くなった。",
  "古い城の扉がきしみながら開いた。",
  "魔法の剣が光り始めた。",
  "風が物語を運んでくる。",
  "星が瞬いて、新しい冒険を予感させる。",
  "時間が止まったような静寂が訪れた。"
]

// プロジェクトのテキストコンテンツを保存するマップ
const projectTextContents: Map<string, Map<string, string>> = new Map()

// Mock projects data (ProjectTextRelationベース)
const mockProjects: ProjectTextRelation[] = [
  {
    id: 'proj-001',
    name: '冒険の始まり',
    main: '冒険の始まり.md',
    ai_policy: {
      read: 'allow',
      quote: 'internal',
      write: 'deny',
      scope: ['local'],
      until: null
    },
    texts: [
      {
        id: 't-main',
        path: 'texts/冒険の始まり.md'
      }
    ],
    tags: ['冒険', 'ファンタジー', '魔法'],
    tag_docs: {},
    libraly: ['辞書'],
    lib_docs: {
      '辞書': { path: 'tags/辞書.md' }
    }
  },
  {
    id: 'proj-002',
    name: '謎の遺跡',
    main: '謎の遺跡.md',
    ai_policy: {
      read: 'allow',
      quote: 'internal',
      write: 'deny',
      scope: ['local'],
      until: null
    },
    texts: [
      {
        id: 't-main',
        path: 'texts/謎の遺跡.md'
      }
    ],
    tags: ['ミステリー', '古代', '考古学'],
    tag_docs: {},
    libraly: ['辞書'],
    lib_docs: {
      '辞書': { path: 'tags/辞書.md' }
    }
  },
  {
    id: 'proj-003',
    name: '宇宙の旅人',
    main: '宇宙の旅人.md',
    ai_policy: {
      read: 'allow',
      quote: 'internal',
      write: 'deny',
      scope: ['local'],
      until: null
    },
    texts: [
      {
        id: 't-main',
        path: 'texts/宇宙の旅人.md'
      }
    ],
    tags: ['SF', '宇宙', '冒険'],
    tag_docs: {},
    libraly: ['辞書'],
    lib_docs: {
      '辞書': { path: 'tags/辞書.md' }
    }
  }
]

// 初期テキストコンテンツを設定
projectTextContents.set('proj-001', new Map([
  ['t-main', `主人公のアレックスは小さな村で平凡な生活を送っていた。毎日同じような日々が続き、何か変化を求めていた。

ある朝、村の外れで不思議な光を発する石を発見した。その石に触れた瞬間、世界が一変した。

「これは...魔法の石？」アレックスは呟いた。

その時、石から声が聞こえてきた。「選ばれし者よ、君の冒険が今始まる...」`]
]))

projectTextContents.set('proj-002', new Map([
  ['t-main', `考古学者のサラは古代の遺跡で不思議な発見をした。壁に刻まれた文字は、これまで見たことのない言語だった。

「この文字...古代エジプトとも、マヤ文明とも違う」サラは顕微鏡で文字を詳しく調べた。

突然、遺跡の奥から光が差し込んだ。それは自然光ではない。人工的な光だった。

「誰かいるのか？」サラは懐中電灯を手に取り、光の方向へ歩き始めた。`]
]))

projectTextContents.set('proj-003', new Map([
  ['t-main', `宇宙船パイオニア号は未知の惑星に向かっていた。船長のケンは地球を離れてから3年が経過していた。

「地球からの最後の通信から6ヶ月が経った」ケンは航海日誌に記録した。

その時、船の警報システムが作動した。「未知の物体が接近中」という警告音が響いた。

ケンはスクリーンを見つめた。そこには、これまで見たことのない巨大な宇宙船が映し出されていた。`]
]))

// 後方互換性のためのScenario型データ（既存UIとの互換性を保つため）
// const mockScenarios: Scenario[] = [] // 未使用のためコメントアウト

class MockDataService {
  private projects: ProjectTextRelation[] = [...mockProjects]
  private projectTextContents: Map<string, Map<string, string>> = new Map(projectTextContents)
  private projectDictionaries: Map<string, DictionaryEntry[]> = new Map()
  private scenarios: Scenario[] = []

  /**
   * タグの正規化処理
   * - 重複を排除
   * - 空文字列や空白のみのタグを除去
   * - 前後の空白を削除
   */
  private normalizeTags(tags: string[]): string[] {
    if (!tags || tags.length === 0) return []
    
    // 前後の空白を削除し、空文字列を除去
    const trimmed = tags
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
    
    // 重複を排除（大文字小文字を区別）
    return Array.from(new Set(trimmed))
  }

  /**
   * プロジェクトのタグを正規化し、重複を統合する
   * 既存データの移行処理：text.tags → project.tags にマージ
   */
  private normalizeProjectTags(project: ProjectTextRelation): void {
    // 既存データの移行：テキストレベルのタグをプロジェクトレベルにマージ
    const textTags: string[] = []
    project.texts.forEach(text => {
      // 型安全性のため、anyとして扱う（既存データの移行用）
      const textAny = text as any
      if (textAny.tags && Array.isArray(textAny.tags)) {
        textTags.push(...textAny.tags)
        // テキストレベルのタグを削除
        delete textAny.tags
      }
    })
    
    // プロジェクトレベルのタグとテキストレベルのタグをマージして正規化
    const allTags = [...(project.tags || []), ...textTags]
    project.tags = this.normalizeTags(allTags)
  }

  /**
   * すべてのプロジェクトのタグを正規化する（初期ロード時などに使用）
   */
  private normalizeAllProjectTags(): void {
    this.projects.forEach(project => {
      this.normalizeProjectTags(project)
    })
  }

  // ProjectTextRelationをScenarioに変換（後方互換性のため）
  private projectToScenario(project: ProjectTextRelation, authorId: string): Scenario {
    const mainTextId = project.texts[0]?.id || 't-main'
    const mainText = this.getProjectTextContent(project.id, mainTextId) || ''
    const dictionary = this.getProjectDictionary(project.id)
    
    return {
      id: project.id,
      title: project.name,
      content: mainText,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: this.normalizeTags(project.tags || []),
      isPublic: true,
      authorId,
      dictionaryEntries: dictionary
    }
  }

  // プロジェクトのテキストコンテンツを取得
  getProjectTextContent(projectId: string, textId: string): string | null {
    const contents = this.projectTextContents.get(projectId)
    return contents?.get(textId) || null
  }

  // プロジェクトのテキストコンテンツを設定
  setProjectTextContent(projectId: string, textId: string, content: string): void {
    if (!this.projectTextContents.has(projectId)) {
      this.projectTextContents.set(projectId, new Map())
    }
    this.projectTextContents.get(projectId)!.set(textId, content)
  }

  // プロジェクトを取得
  getProject(id: string): ProjectTextRelation | null {
    return this.projects.find(p => p.id === id) || null
  }

  // ユーザーのプロジェクト一覧を取得
  getUserProjects(_userId: string): ProjectTextRelation[] {
    // 現時点では全プロジェクトを返す（将来的にuserIdでフィルタリング）
    return this.projects
  }

  // Get all scenarios for a user (後方互換性のため)
  getUserScenarios(userId: string): Scenario[] {
    const userProjects = this.getUserProjects(userId)
    return userProjects.map(p => this.projectToScenario(p, userId))
  }

  // Get a specific scenario (後方互換性のため)
  getScenario(id: string): Scenario | null {
    const project = this.getProject(id)
    if (!project) return null
    return this.projectToScenario(project, 'mock-user-id')
  }

  // Create a new project (後方互換性のためcreateScenarioとしても利用可能)
  createScenario(
    scenario: Omit<Scenario, 'id' | 'createdAt' | 'updatedAt' | 'dictionaryEntries'> & { dictionaryEntries?: DictionaryEntry[] }
  ): string {
    const projectId = `proj-${Date.now()}`
    const mainTextId = 't-main'
    
    // 新しいプロジェクトを作成
    const newProject: ProjectTextRelation = {
      id: projectId,
      name: scenario.title,
      main: `${scenario.title}.md`,
      ai_policy: {
        read: 'allow',
        quote: 'internal',
        write: 'deny',
        scope: ['local'],
        until: null
      },
      texts: [
        {
          id: mainTextId,
          path: `texts/${scenario.title}.md`
        }
      ],
      tags: this.normalizeTags(scenario.tags || []),
      tag_docs: {},
      libraly: scenario.dictionaryEntries && scenario.dictionaryEntries.length > 0 ? ['辞書'] : undefined,
      lib_docs: scenario.dictionaryEntries && scenario.dictionaryEntries.length > 0 ? {
        '辞書': { path: 'tags/辞書.md' }
      } : undefined
    }
    
    this.projects.push(newProject)
    this.setProjectTextContent(projectId, mainTextId, scenario.content)
    
    if (scenario.dictionaryEntries && scenario.dictionaryEntries.length > 0) {
      this.projectDictionaries.set(projectId, scenario.dictionaryEntries)
    }
    
    this.saveToLocalStorage()
    return projectId
  }

  // Update a project (後方互換性のためupdateScenarioとしても利用可能)
  updateScenario(id: string, updates: Partial<Scenario>): void {
    const project = this.getProject(id)
    if (!project) return
    
    // プロジェクト名の更新
    if (updates.title) {
      project.name = updates.title
      project.main = `${updates.title}.md`
    }
    
    // タグの更新（正規化処理を適用）
    if (updates.tags) {
      project.tags = this.normalizeTags(updates.tags)
    }
    
    // プロジェクトのタグを正規化（テキストレベルのタグを削除）
    this.normalizeProjectTags(project)
    
    // コンテンツの更新
    if (updates.content !== undefined) {
      const mainTextId = project.texts[0]?.id || 't-main'
      this.setProjectTextContent(id, mainTextId, updates.content)
    }
    
    // 辞書の更新
    if (updates.dictionaryEntries) {
      this.projectDictionaries.set(id, updates.dictionaryEntries)
      // 辞書がある場合はlibralyとlib_docsを更新
      if (updates.dictionaryEntries.length > 0) {
        project.libraly = ['辞書']
        project.lib_docs = {
          '辞書': { path: 'tags/辞書.md' }
        }
      } else {
        project.libraly = undefined
        project.lib_docs = undefined
      }
    }
    
    this.saveToLocalStorage()
  }

  // プロジェクトレベルの辞書エントリを追加
  addDictionaryEntry(projectId: string, entry: { term: string; description: string }): DictionaryEntry | null {
    const project = this.getProject(projectId)
    if (!project) return null
    
    const newEntry: DictionaryEntry = {
      id: Date.now().toString(),
      ...entry,
      createdAt: new Date()
    }
    
    const entries = this.projectDictionaries.get(projectId) || []
    this.projectDictionaries.set(projectId, [...entries, newEntry])
    this.saveToLocalStorage()
    return newEntry
  }

  // プロジェクトレベルの辞書エントリを削除
  removeDictionaryEntry(projectId: string, entryId: string): void {
    const entries = this.projectDictionaries.get(projectId) || []
    this.projectDictionaries.set(projectId, entries.filter(entry => entry.id !== entryId))
    this.saveToLocalStorage()
  }

  // プロジェクトレベルの辞書エントリを更新
  updateDictionaryEntry(
    projectId: string,
    entryId: string,
    entry: { term: string; description: string }
  ): DictionaryEntry | null {
    const entries = this.projectDictionaries.get(projectId) || []
    const updated = entries.map(item =>
      item.id === entryId
        ? {
            ...item,
            term: entry.term,
            description: entry.description
          }
        : item
    )
    this.projectDictionaries.set(projectId, updated)
    this.saveToLocalStorage()
    return updated.find(item => item.id === entryId) ?? null
  }

  // プロジェクトレベルの辞書エントリ一覧を取得
  getProjectDictionary(projectId: string): DictionaryEntry[] {
    return this.projectDictionaries.get(projectId) || []
  }

  // Delete a scenario
  deleteScenario(id: string): void {
    this.scenarios = this.scenarios.filter(s => s.id !== id)
    this.saveToLocalStorage()
  }

  // Get public scenarios
  getPublicScenarios(): Scenario[] {
    return this.scenarios.filter(s => s.isPublic)
  }

  // Generate AI suggestions
  generateAISuggestions(): string[] {
    // Return random suggestions
    const shuffled = [...mockAISuggestions].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, 5)
  }

  // Load from localStorage
  loadFromLocalStorage(): void {
    // プロジェクトデータの読み込み
    const savedProjects = localStorage.getItem('mockProjects')
    if (savedProjects) {
      try {
        this.projects = JSON.parse(savedProjects)
        // 読み込み後にタグを正規化
        this.normalizeAllProjectTags()
      } catch (error) {
        console.error('Error loading projects from localStorage:', error)
      }
    }
    
    // テキストコンテンツの読み込み
    const savedContents = localStorage.getItem('mockProjectTextContents')
    if (savedContents) {
      try {
        const parsed = JSON.parse(savedContents)
        this.projectTextContents = new Map(
          Object.entries(parsed).map(([projectId, contents]: [string, any]) => [
            projectId,
            new Map(Object.entries(contents))
          ])
        )
      } catch (error) {
        console.error('Error loading project text contents from localStorage:', error)
      }
    }
    
    // 辞書データの読み込み
    const savedDictionaries = localStorage.getItem('mockProjectDictionaries')
    if (savedDictionaries) {
      try {
        const parsed = JSON.parse(savedDictionaries)
        this.projectDictionaries = new Map(
          Object.entries(parsed).map(([projectId, entries]: [string, any]) => [
            projectId,
            entries.map((entry: any) => ({
              ...entry,
              createdAt: new Date(entry.createdAt)
            }))
          ])
        )
      } catch (error) {
        console.error('Error loading project dictionaries from localStorage:', error)
      }
    }
  }

  // Save to localStorage
  private saveToLocalStorage(): void {
    // プロジェクトデータの保存
    localStorage.setItem('mockProjects', JSON.stringify(this.projects))
    
    // テキストコンテンツの保存
    const contentsObj: Record<string, Record<string, string>> = {}
    this.projectTextContents.forEach((contents, projectId) => {
      contentsObj[projectId] = Object.fromEntries(contents)
    })
    localStorage.setItem('mockProjectTextContents', JSON.stringify(contentsObj))
    
    // 辞書データの保存
    const dictionariesObj: Record<string, DictionaryEntry[]> = {}
    this.projectDictionaries.forEach((entries, projectId) => {
      dictionariesObj[projectId] = entries
    })
    localStorage.setItem('mockProjectDictionaries', JSON.stringify(dictionariesObj))
  }

  // Initialize service
  constructor() {
    // 初期プロジェクトデータを設定
    this.projects = [...mockProjects]
    this.projectTextContents = new Map(projectTextContents)
    
    // localStorageからデータを読み込む（既存データがあれば上書き）
    this.loadFromLocalStorage()
    
    // 初期ロード時にすべてのプロジェクトのタグを正規化（重複タグを統合）
    this.normalizeAllProjectTags()
    this.saveToLocalStorage()
  }
}

export const mockDataService = new MockDataService()

