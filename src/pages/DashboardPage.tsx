import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/components/providers/MockAuthProvider'
import { Button } from '@/components/ui/Button'
import { SettingsModal, SettingsData } from '@/components/SettingsModal'
import { PromptInputModal } from '@/components/PromptInputModal'
import { DictionaryInputModal } from '@/components/DictionaryInputModal'
import { mockDataService, Scenario } from '@/services/mockDataService'
import { Plus, Settings, LogOut, ChevronRight, X, Minus, Download } from 'lucide-react'
import { renderMarkdownToHtml, MARKDOWN_TEST_SNIPPET, applyDictionaryHighlights } from '@/utils/markdown'
import { parseOutlineSections, reorderSectionsInMarkdown } from '@/utils/outline'
import { ProjectTextRelation, AIPolicy, DictionaryEntry } from '@/types'
import JSZip from 'jszip'

const VIEW_MODES = ['outline', 'plain', 'preview', 'markdown'] as const
const PREVIEW_LAYOUTS = ['edit', 'split', 'preview'] as const
type PreviewLayout = (typeof PREVIEW_LAYOUTS)[number]

const DEFAULT_PREVIEW_CONTENT = `
### 一章　冷たい朝
窓の外では、灰色の空が静かに澱んでいる。  
雨粒がガラスを伝い、ひとつひとつの呼吸のように流れていく。  
目を覚ましても、世界はまだ眠っているようだった。

### 二章　傘の下の世界
通りには、人の影がぽつぽつと揺れている。  
傘の布地を叩く音が、唯一のリズム。  
すれ違う誰かの温度が、雨に溶けて消えていった。

### 三章　湯気の向こう
喫茶店の扉を開けると、温かな香りが迎えてくれる。  
コーヒーの湯気が曇った眼鏡を曇らせ、世界を少し柔らかくした。
`

const DEFAULT_MARKDOWN_CONTENT = `# 雨の日の幸

## 一章　冷たい朝
窓の外では、灰色の空が静かに澱んでいる。
雨粒がガラスを伝い、ひとつひとつの呼吸のように流れていく。
目を覚ましても、世界はまだ眠っているようだった。

## 二章　傘の下の世界
通りには、人の影がぽつぽつと揺れている。
傘の布地を叩く音が、唯一のリズム。
すれ違う誰かの温度が、雨に溶けて消えていった。

## 三章　湯気の向こう
喫茶店の扉を開けると、温かな香りが迎えてくれる。
コーヒーの湯気が曇った眼鏡を曇らせ、世界を少し柔らかくした。
`

const DashboardPage: React.FC = () => {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [scenarios, setScenarios] = React.useState<Scenario[]>([])
  const [isLoadingScenarios, setIsLoadingScenarios] = React.useState(true)
  const [selectedScenarioId, setSelectedScenarioId] = React.useState<string | null>(null)
  const [viewMode, setViewMode] = React.useState<(typeof VIEW_MODES)[number] | null>('plain')
  const [previewLayout, setPreviewLayout] = React.useState<PreviewLayout>('edit')
  const lastMarkdownLayoutRef = React.useRef<PreviewLayout>('edit')
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false)
  const [isPromptInputOpen, setIsPromptInputOpen] = React.useState(false)
  const [editorContent, setEditorContent] = React.useState(DEFAULT_MARKDOWN_CONTENT)
  const [projectName, setProjectName] = React.useState('')
  const [generatedText, setGeneratedText] = React.useState('')
  const [isGenerating, setIsGenerating] = React.useState(false)
  // タグ編集機能は削除（設定画面で管理）
  const [showDictionaryManager, setShowDictionaryManager] = React.useState(false)
  const [isDictionaryInputOpen, setIsDictionaryInputOpen] = React.useState(false)
  const [dictionaryItems, setDictionaryItems] = React.useState<DictionaryEntry[]>([])
  const [editingDictionaryEntry, setEditingDictionaryEntry] = React.useState<DictionaryEntry | null>(null)
  const [showProofreadMode, setShowProofreadMode] = React.useState(false)
  const [customPanels, setCustomPanels] = React.useState<Array<{ id: string; title: string; content: string }>>([
    { id: 'summary', title: 'あらすじ', content: '' },
    { id: 'note', title: 'Note', content: '' },
    { id: 'vocabulary', title: '単語帳', content: '' },
    { id: 'memo', title: 'メモ', content: '' }
  ])
  const [expandedChapters, setExpandedChapters] = React.useState<Set<string>>(new Set())
  const [draggingSectionId, setDraggingSectionId] = React.useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = React.useState<string | null>(null)
  const previewContainerRef = React.useRef<HTMLDivElement | null>(null)
  const [isProjectListCollapsed, setIsProjectListCollapsed] = React.useState(false)

  // React.useEffect(() => {
  //   if (!user) {
  //     navigate('/login')
  //   }
  // }, [user, navigate])

  React.useEffect(() => {
    if (user) {
      loadScenarios()
    }
  }, [user])

  React.useEffect(() => {
    if (scenarios.length > 0 && !selectedScenarioId) {
      setSelectedScenarioId(scenarios[0].id)
    }
  }, [scenarios, selectedScenarioId])

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) || null

  React.useEffect(() => {
    if (selectedScenarioId && selectedScenario) {
      // 既存のコンテンツをチェックして、章が4つ未満の場合は追加
      let currentContent = selectedScenario.content || ''
      
      // 「見出しレベル」で始まる行を削除
      const lines = currentContent.split('\n')
      const filteredLines = lines.filter(line => {
        const trimmed = line.trim()
        return !trimmed.match(/^#+\s*見出しレベル/)
      })
      currentContent = filteredLines.join('\n')
      
      const outlineSections = parseOutlineSections(currentContent)
      const chapterCount = outlineSections.filter(section => section.level === 2).length
      
      let contentToSet = currentContent
      
      // 章が4つ未満の場合、4つの章を追加または置き換え
      if (chapterCount < 4) {
        const defaultChapters = `## 第一章\n\nここに第一章の内容を記述してください。\n\n## 第二章\n\nここに第二章の内容を記述してください。\n\n## 第三章\n\nここに第三章の内容を記述してください。\n\n## 第四章\n\nここに第四章の内容を記述してください。\n`
        
        // 既存のコンテンツが空または非常に短い場合は、4つの章で置き換え
        if (!currentContent.trim() || currentContent.trim().length < 50) {
          contentToSet = defaultChapters
        } else {
          // 既存のコンテンツがある場合は、その後に追加
          contentToSet = currentContent.trim() + '\n\n' + defaultChapters
        }
        
        // コンテンツを更新
        if (user) {
          mockDataService.updateScenario(selectedScenario.id, {
            content: contentToSet
          })
        }
      }
      
      setEditorContent(contentToSet)
      // Ensure project name is always synced with selected scenario title
      setProjectName(selectedScenario.title || '')
      setDictionaryItems(selectedScenario.dictionaryEntries ?? [])
    } else {
      setEditorContent('')
      setProjectName('')
      setDictionaryItems([])
    }
  }, [selectedScenarioId, selectedScenario, user])

  React.useEffect(() => {
    if (viewMode === 'preview' && previewLayout !== 'preview') {
      setPreviewLayout('preview')
    } else if (viewMode === 'markdown' && previewLayout !== lastMarkdownLayoutRef.current) {
      setPreviewLayout(lastMarkdownLayoutRef.current)
    }
  }, [viewMode, previewLayout])

  // 生成テキスト関連の状態は、モーダル連携など将来のUI拡張で使用予定のため保持する
  // TypeScriptの未使用警告を抑制する目的で依存配列として参照しておく
  React.useEffect(() => {
    // no-op
  }, [generatedText, isGenerating])

  const handleProjectNameChange = (newName: string) => {
    setProjectName(newName)
    if (selectedScenario && user) {
      mockDataService.updateScenario(selectedScenario.id, {
        title: newName
      })
      loadScenarios()
    }
  }

  const loadScenarios = async () => {
    try {
      if (user) {
        const userScenarios = mockDataService.getUserScenarios(user.uid)
        setScenarios(userScenarios)
      }
    } catch (error) {
      console.error('Error loading scenarios:', error)
    } finally {
      setIsLoadingScenarios(false)
    }
  }


  const handleSignOut = async () => {
    try {
      await signOut()
      navigate('/')
    } catch (error) {
      console.error('Sign out error:', error)
    }
  }

  const handleCreateScenario = () => {
    if (!user) return
    
    // 4つの章を含むデフォルトコンテンツを生成
    const defaultContent = `## 第一章

ここに第一章の内容を記述してください。

## 第二章

ここに第二章の内容を記述してください。

## 第三章

ここに第三章の内容を記述してください。

## 第四章

ここに第四章の内容を記述してください。
`
    
    const newId = mockDataService.createScenario({
      title: '新しいプロジェクト',
      content: defaultContent,
      tags: [],
      isPublic: false,
      authorId: user.uid
    })
    loadScenarios()
    setSelectedScenarioId(newId)
  }

  const handleSaveSettings = (settings: SettingsData) => {
    console.log('Settings saved:', settings)
    // 設定を保存した後の処理（必要に応じて実装）
  }

  const buildProjectExportJson = async (scenario: Scenario): Promise<{ project: ProjectTextRelation; files: Record<string, string> }> => {
    // プロジェクト構造を取得
    const project = mockDataService.getProject(scenario.id)
    if (!project) {
      // プロジェクトが存在しない場合は、Scenarioから構築
      const mainFileName = `${scenario.title || 'project'}.md`
      const mainFilePath = `texts/${mainFileName}`

      const defaultPolicy: AIPolicy = {
        read: 'allow',
        quote: 'internal',
        write: 'deny',
        scope: ['local'],
        until: null
      }

      const projectData: ProjectTextRelation = {
        id: `proj-${scenario.id}`,
        name: scenario.title || '無題プロジェクト',
        main: mainFileName,
        ai_policy: defaultPolicy,
        texts: [
          {
            id: 't-main',
            path: mainFilePath
          }
        ],
        tags: Array.from(new Set((scenario.tags || []).filter(tag => tag && tag.trim().length > 0).map(tag => tag.trim()))),
        tag_docs: {},
        libraly: scenario.dictionaryEntries && scenario.dictionaryEntries.length > 0 ? ['辞書'] : undefined,
        lib_docs:
          scenario.dictionaryEntries && scenario.dictionaryEntries.length > 0
            ? {
                辞書: { path: 'tags/辞書.md' }
              }
            : undefined
      }

      const files: Record<string, string> = {
        [mainFilePath]: editorContent
      }

      if (scenario.dictionaryEntries && scenario.dictionaryEntries.length > 0) {
        const dictMarkdown = scenario.dictionaryEntries
          .map((entry) => `### ${entry.term}\n${entry.description}`)
          .join('\n\n')
        files['tags/辞書.md'] = dictMarkdown
      }

      return { project: projectData, files }
    }

    // プロジェクト構造から直接エクスポート
    const files: Record<string, string> = {}

    // すべてのテキストファイルを取得
    for (const text of project.texts) {
      const content = mockDataService.getProjectTextContent(project.id, text.id)
      if (content) {
        files[text.path] = content
      }
    }

    // タグドキュメントを取得
    for (const [tagName, tagDoc] of Object.entries(project.tag_docs || {})) {
      // タグドキュメントの内容は現時点では空（将来的に実装）
      if (tagDoc.path && !files[tagDoc.path]) {
        files[tagDoc.path] = `# ${tagName}\n\nタグ「${tagName}」の説明`
      }
    }

    // ライブラリドキュメントを取得
    if (project.lib_docs) {
      for (const [libName, libDoc] of Object.entries(project.lib_docs)) {
        if (libDoc.path && !files[libDoc.path]) {
          // 辞書の場合
          if (libName === '辞書') {
            const dictionary = mockDataService.getProjectDictionary(project.id)
            if (dictionary.length > 0) {
              const dictMarkdown = dictionary
                .map((entry) => `### ${entry.term}\n${entry.description}`)
                .join('\n\n')
              files[libDoc.path] = dictMarkdown
            } else {
              files[libDoc.path] = `# 辞書\n\nプロジェクト「${project.name}」の辞書`
            }
          } else {
            files[libDoc.path] = `# ${libName}\n\nライブラリ「${libName}」の内容`
          }
        }
      }
    }

    return { project, files }
  }

  const handleExportProject = async () => {
    if (!selectedScenario) {
      alert('エクスポートするプロジェクトを選択してください。')
      return
    }

    try {
      const { project, files } = await buildProjectExportJson(selectedScenario)
      
      // エクスポート用のプロジェクトデータを作成
      // 既存データの移行処理：texts[]からtagsを削除（型定義では既に削除済みだが、既存データ対応）
      const exportProject = {
        ...project,
        texts: project.texts.map(text => {
          // 型安全性のため、anyとして扱う（既存データの移行用）
          const textAny = text as any
          if (textAny.tags) {
            const { tags, ...textWithoutTags } = textAny
            return textWithoutTags
          }
          return text
        })
      }
      
      // ZIPファイルを作成
      const zip = new JSZip()
      
      // 1. project.json - プロジェクトデータ全体（texts[]からtagsを削除済み）
      zip.file('project.json', JSON.stringify(exportProject, null, 2))
      
      // 2. texts/*.md - すべてのテキストファイル
      for (const [filePath, content] of Object.entries(files)) {
        zip.file(filePath, content)
      }
      
      // 3. dictionary.json - 辞書データ（プロジェクトレベル）
      const dictionary = mockDataService.getProjectDictionary(selectedScenario.id)
      if (dictionary.length > 0) {
        zip.file('dictionary.json', JSON.stringify(dictionary, null, 2))
      }
      
      // 4. tags.json - タグデータ（プロジェクトレベル、重複排除済み）
      const uniqueTags = Array.from(new Set((project.tags || []).filter(tag => tag && tag.trim().length > 0).map(tag => tag.trim())))
      if (uniqueTags.length > 0) {
        zip.file('tags.json', JSON.stringify({
          tags: uniqueTags,
          tag_docs: project.tag_docs || {}
        }, null, 2))
      }
      
      // ZIPファイルを生成してダウンロード
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      const safeTitle = selectedScenario.title || 'project'
      // ファイル名に使用できない文字を除去
      const sanitizedTitle = safeTitle.replace(/[<>:"/\\|?*]/g, '_')
      link.href = url
      link.download = `${sanitizedTitle}-export.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      alert('プロジェクトのエクスポートが完了しました。')
    } catch (error) {
      console.error('Export error:', error)
      alert('プロジェクトのエクスポートに失敗しました。')
    }
  }

  const handleContentChange = (newContent: string) => {
    setEditorContent(newContent)
    if (selectedScenario && user) {
      mockDataService.updateScenario(selectedScenario.id, {
        content: newContent
      })
    }
  }

  const handlePreviewLayoutSelect = (layout: PreviewLayout) => {
    if (viewMode === 'markdown') {
      lastMarkdownLayoutRef.current = layout
      setPreviewLayout(layout)
      return
    }

    if (viewMode === 'preview') {
      if (layout === 'preview') {
        setPreviewLayout('preview')
      } else {
        lastMarkdownLayoutRef.current = layout
        setViewMode('markdown')
        setPreviewLayout(layout)
      }
      return
    }

    setViewMode('markdown')
    lastMarkdownLayoutRef.current = layout
    setPreviewLayout(layout)
  }

  // Plainモード用の表示・保存変換
  // すべての見出し記号（#、##、###、####、#####、######）を削除
  const toPlainText = (content: string) => {
    if (!content) return ''
    // 行頭の#記号（1〜6個）とその後の空白を削除
    return content.replace(/^#{1,6}\s+/gm, '')
  }
  
  // PlainテキストからMarkdownに戻す際の変換
  // 見出し行を検出して適切なレベルの#記号を追加
  const fromPlainText = (plain: string) => {
    if (!plain) return ''
    
    // 元のMarkdownコンテンツから見出し構造を取得
    const originalSections = parseOutlineSections(editorContent)
    
    // Plainテキストを行ごとに処理
    const lines = plain.split('\n')
    const result: string[] = []
    
    // 見出し候補のパターン（「第X章」「Chapter X」など）
    const headingPatterns = [
      /^第[一二三四五六七八九十百千万\d]+章/,
      /^Chapter\s+\d+/i,
      /^第\d+章/,
      /^第\d+節/,
      /^第\d+部/,
      /^第[一二三四五六七八九十百千万\d]+節/,
      /^第[一二三四五六七八九十百千万\d]+部/,
    ]
    
    let sectionIndex = 0
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()
      
      // 空行の場合はそのまま追加
      if (!trimmed) {
        result.push(line)
        continue
      }
      
      // 見出し行かどうかを判定
      const isHeading = headingPatterns.some(pattern => pattern.test(trimmed))
      
      if (isHeading && sectionIndex < originalSections.length) {
        // 元の見出しレベルを使用
        const level = originalSections[sectionIndex].level
        const prefix = '#'.repeat(Math.min(Math.max(level, 1), 6))
        result.push(`${prefix} ${trimmed}`)
        sectionIndex++
      } else {
        result.push(line)
      }
    }
    
    return result.join('\n')
  }
  
  // Plain Modeで#記号を入力された場合に削除する関数
  const removeHashSymbols = (text: string): string => {
    // 行頭の#記号（1〜6個）とその後の空白を削除
    return text.replace(/^#{1,6}\s+/gm, '')
  }

  const handleInjectMarkdownSample = () => {
    handleContentChange(MARKDOWN_TEST_SNIPPET)
    setViewMode('markdown')
  }

  const handleAddArticle = () => {
    setIsPromptInputOpen(true)
  }

  const handleSavePromptText = (text: string) => {
    // 入力したテキストを生成テキストボックスに表示
    setGeneratedText(text)
  }

  const handleGenerateText = async (prompt: string) => {
    setIsGenerating(true)
    try {
      // モック実装: 実際のAPIが利用可能になるまで、ダミーテキストを返す
      // 実際の実装では、aiAPI.generateText(prompt) を呼び出す
      await new Promise(resolve => setTimeout(resolve, 1500)) // ローディングをシミュレート
      
      // モックレスポンス
      const mockGeneratedText = `【生成されたテキスト】\n\n${prompt}に基づいて生成されたテキストがここに表示されます。\n\n実際の実装では、AI API（ChatGPTまたはClaude）から取得したテキストが表示されます。`
      
      setGeneratedText(mockGeneratedText)
      
      // 実際のAPI呼び出し（コメントアウト）
      // const response = await aiAPI.generateText(prompt)
      // setGeneratedText(response.text || response.message || 'テキストの生成に失敗しました。')
    } catch (error) {
      console.error('Text generation error:', error)
      setGeneratedText('テキストの生成中にエラーが発生しました。')
    } finally {
      setIsGenerating(false)
    }
  }

  // タグは参照のみ（編集機能は削除）
  // タグ編集は設定画面で行う

  const handleAddDictionary = () => {
    if (!showDictionaryManager) {
      setShowDictionaryManager(true)
    }
    setEditingDictionaryEntry(null)
    setIsDictionaryInputOpen(true)
  }

  const handleAddDictionaryItem = ({ term, description }: { term: string; description: string }) => {
    if (!selectedScenario) return
    const entry = mockDataService.addDictionaryEntry(selectedScenario.id, { term, description })
    if (entry) {
      setDictionaryItems(prev => [...prev, entry])
      setShowDictionaryManager(true)
      loadScenarios()
      setEditingDictionaryEntry(null)
    }
  }

  const handleRemoveDictionaryEntry = (entryId: string) => {
    if (!selectedScenario) return
    mockDataService.removeDictionaryEntry(selectedScenario.id, entryId)
    setDictionaryItems(prev => prev.filter(entry => entry.id !== entryId))
    loadScenarios()
  }

  const handleDictionaryModalSave = ({ term, description }: { term: string; description: string }) => {
    if (!selectedScenario) return

    if (editingDictionaryEntry) {
      const updated = mockDataService.updateDictionaryEntry(selectedScenario.id, editingDictionaryEntry.id, {
        term,
        description
      })
      if (updated) {
        setDictionaryItems(prev => prev.map(item => (item.id === updated.id ? updated : item)))
        setEditingDictionaryEntry(null)
        setShowDictionaryManager(true)
        loadScenarios()
      }
      return
    }

    handleAddDictionaryItem({ term, description })
  }

  const handleEditDictionaryEntry = (entry: DictionaryEntry) => {
    setEditingDictionaryEntry(entry)
    setIsDictionaryInputOpen(true)
  }

  const handleCloseDictionaryManager = () => {
    setShowDictionaryManager(false)
  }

  const handleSearchMaterials = () => {
    alert('資料の検索機能は今後実装予定です')
  }

  const handleProofreadRange = () => {
    setShowProofreadMode(true)
  }

  const handleUpdatePanelTitle = (id: string, newTitle: string) => {
    setCustomPanels(customPanels.map(panel => 
      panel.id === id ? { ...panel, title: newTitle } : panel
    ))
  }

  const handleRemovePanel = (id: string) => {
    setCustomPanels(customPanels.filter(panel => panel.id !== id))
  }

  const outlineSections = React.useMemo(() => parseOutlineSections(editorContent), [editorContent])
  const renderedMarkdown = React.useMemo(
    () => renderMarkdownToHtml(editorContent || DEFAULT_PREVIEW_CONTENT),
    [editorContent]
  )
  const dictionaryHighlightedMarkdown = React.useMemo(
    () => applyDictionaryHighlights(renderedMarkdown, dictionaryItems),
    [renderedMarkdown, dictionaryItems]
  )
  const toggleChapter = (id: string) => {
    const newExpanded = new Set(expandedChapters)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedChapters(newExpanded)
  }

  const handleReorderSection = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return
    const updated = reorderSectionsInMarkdown(editorContent, sourceId, targetId)
    if (updated !== editorContent) {
      handleContentChange(updated)
    }
  }

  if (isLoadingScenarios) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-indigo-50/20 via-purple-50/10 to-pink-50/20 relative overflow-hidden">
        {/* 装飾的な背景要素 */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-full blur-3xl animate-pulse"></div>
        </div>
        <div className="flex flex-col items-center gap-6 relative z-10">
          <div className="relative">
            <div className="animate-spin rounded-full h-20 w-20 border-4 border-slate-200/50 border-t-indigo-500 border-r-purple-500" />
            <div className="absolute inset-0 animate-spin rounded-full h-20 w-20 border-4 border-transparent border-b-pink-500 border-l-emerald-500" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-slate-700 mb-1">読み込み中...</p>
            <p className="text-xs text-slate-500">プロジェクトを読み込んでいます</p>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-50 via-indigo-50/20 via-purple-50/10 to-pink-50/20 relative">
      {/* 装飾的な背景要素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-blue-400/10 to-purple-400/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-indigo-400/10 to-pink-400/10 rounded-full blur-3xl"></div>
      </div>
      
      <div className="h-full w-full flex flex-col px-6 py-6 relative z-10">
        {/* Header - ワイヤーフレームに合わせたデザイン */}
        <div className="mb-6 flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            {/* 左：プロジェクト名 + 新規作成ボタン */}
            <div className="flex flex-row items-end gap-8 basis-full sm:basis-[60%]">
              <div className="flex-1 max-w-[300px]">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  placeholder="プロジェクトの名前"
                  className="w-full px-5 py-2.5 bg-white/95 backdrop-blur-md border-2 border-slate-200/80 rounded-lg text-base text-slate-800 placeholder-slate-400 shadow-lg shadow-slate-200/50 hover:shadow-xl hover:shadow-slate-300/50 hover:border-indigo-300/50 focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-300"
                />
              </div>
              <div className="flex items-end">
                <Button 
                  variant="outline" 
                  onClick={handleCreateScenario}
                  className="px-5 py-3 bg-white/90 backdrop-blur-md border-2 border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-700 shadow-lg shadow-slate-200/50 hover:bg-white hover:shadow-xl hover:shadow-slate-300/50 hover:border-indigo-300 hover:scale-105 transition-all duration-300 group" 
                >
                  <Plus className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform duration-300" />
                  プロジェクトを新規作成
                </Button>
              </div>
            </div>
            {/* 右：ログアウト + 設定 + エクスポート */}
            <div className="flex flex-col items-end gap-3 basis-full sm:basis-[40%]">
              <Button 
                variant="outline" 
                className="px-5 py-3 bg-white/90 backdrop-blur-md border-2 border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-700 shadow-lg shadow-slate-200/50 hover:bg-white hover:shadow-xl hover:shadow-slate-300/50 hover:border-red-300 hover:scale-105 transition-all duration-300 group" 
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2 group-hover:translate-x-1 transition-transform duration-300" />
                ログアウト
              </Button>
              <div className="flex w-full items-center justify-end gap-[70px]">
                <Button 
                  variant="outline" 
                  className="px-5 py-3 bg-white/90 backdrop-blur-md border-2 border-slate-200/80 rounded-2xl text-sm font-semibold text-slate-700 shadow-lg shadow-slate-200/50 hover:bg-white hover:shadow-xl hover:shadow-slate-300/50 hover:border-indigo-300 hover:scale-105 transition-all duration-300 group" 
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4 mr-2 group-hover:rotate-90 transition-transform duration-300" />
                  設定
                </Button>
                <Button 
                  variant="outline" 
                  className="min-w-[370px] px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white border-0 rounded-2xl text-sm font-semibold shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-105 transition-all duration-300" 
                  onClick={handleExportProject}
                >
                  <Download className="h-4 w-4 mr-2" />
                  ↓ エクスポート
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className={`flex-1 grid grid-cols-1 gap-6 transition-all duration-300 ${
          isProjectListCollapsed
            ? 'xl:grid-cols-[clamp(44px,6vw,56px)_minmax(0,1fr)_clamp(280px,22vw,400px)]'
            : 'xl:grid-cols-[clamp(260px,20vw,300px)_minmax(0,1fr)_clamp(280px,22vw,400px)]'
        } min-h-0`}>
          {/* Project List - モダンなカードデザイン */}
          <aside className={`bg-white/95 backdrop-blur-xl border-2 border-slate-200/60 rounded-3xl p-3 xl:p-6 flex flex-col shadow-2xl shadow-slate-300/30 min-h-0 relative overflow-hidden transition-all duration-300`}>
            {/* 装飾的なグラデーション */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-400/10 to-purple-400/10 rounded-full blur-2xl -mr-16 -mt-16"></div>
            
            <div className="relative z-10 flex flex-col flex-1 min-h-0">
              {/* 左カラムの開閉トグル */}
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                {!isProjectListCollapsed && (
                  <h2 className="text-sm font-bold text-slate-700 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1 h-5 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
                    テキスト一覧
                  </h2>
                )}
                <button
                  type="button"
                  onClick={() => setIsProjectListCollapsed((prev) => !prev)}
                  className="ml-auto inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-white/90 text-slate-500 hover:text-indigo-600 hover:border-indigo-300 shadow-sm hover:shadow-md transition-all duration-300"
                  aria-label={isProjectListCollapsed ? 'テキスト一覧を展開' : 'テキスト一覧を折りたたむ'}
                >
                  <span className={`text-lg leading-none transform transition-transform duration-300 ${isProjectListCollapsed ? '-rotate-180' : ''}`}>
                    ‹
                  </span>
                </button>
              </div>

              {/* 折りたたみ時はリスト部分を非表示にしてトグルだけ残す */}
              {!isProjectListCollapsed && (
                <>
                  <div className="space-y-3 flex-1 overflow-y-auto scrollable pr-2 min-h-0">
                    {scenarios.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                          <Plus className="h-8 w-8 text-slate-400" />
                        </div>
                        <p className="text-sm text-slate-500 font-medium">まだプロジェクトがありません</p>
                      </div>
                    ) : (
                      scenarios.map((scenario) => (
                        <button
                          key={scenario.id}
                          onClick={() => setSelectedScenarioId(scenario.id)}
                          className={`w-full text-left px-5 py-4 rounded-2xl border-2 transition-all duration-300 transform ${
                            selectedScenarioId === scenario.id
                              ? 'border-indigo-500 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-xl shadow-indigo-500/40 scale-[1.02]'
                              : 'border-slate-200/80 bg-white/80 hover:bg-white hover:border-indigo-300/50 hover:shadow-lg hover:shadow-slate-200/50 hover:scale-[1.01] text-slate-700'
                          }`}
                        >
                          <p className="text-sm font-bold truncate">{scenario.title}</p>
                        </button>
                      ))
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleCreateScenario}
                    className="mt-5 w-full justify-center py-4 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0 rounded-2xl font-bold shadow-xl shadow-indigo-500/40 hover:shadow-2xl hover:shadow-indigo-500/50 hover:scale-105 transition-all duration-300 group flex-shrink-0"
                  >
                    <Plus className="h-5 w-5 mr-2 group-hover:rotate-90 transition-transform duration-300" />
                    新規作成
                  </Button>
                </>
              )}
            </div>
          </aside>

          {/* Main Editor - 洗練されたデザイン */}
          <section className="bg-white/95 backdrop-blur-xl border-2 border-slate-200/60 rounded-3xl p-6 flex flex-col shadow-2xl shadow-slate-300/30 min-h-0 relative overflow-hidden">
            {/* 装飾的なグラデーション */}
            <div className="absolute bottom-0 left-0 w-40 h-40 bg-gradient-to-tr from-emerald-400/10 to-teal-400/10 rounded-full blur-2xl -ml-20 -mb-20"></div>
            
            <div className="relative z-10 flex flex-col min-h-0">
              <div className="flex items-center flex-wrap gap-4 mb-5 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                  <span className="text-xs font-bold text-slate-700 tracking-wider uppercase">ViewMode</span>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-5 py-2.5 rounded-2xl border-2 text-sm font-bold capitalize transition-all duration-300 transform ${
                        viewMode === mode
                          ? 'border-emerald-500 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white shadow-xl shadow-emerald-500/40 scale-105'
                          : 'border-slate-200/80 bg-white/80 text-slate-600 hover:bg-white hover:border-emerald-300/50 hover:shadow-lg hover:shadow-slate-200/50 hover:scale-105'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                {(viewMode === 'markdown' || viewMode === 'preview') && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">表示</span>
                    <div className="inline-flex rounded-2xl border-2 border-slate-200/80 overflow-hidden bg-white/90 shadow-lg shadow-slate-200/50">
                      {PREVIEW_LAYOUTS.map((layout) => (
                        <button
                          key={layout}
                          type="button"
                          onClick={() => handlePreviewLayoutSelect(layout)}
                          className={`px-4 py-2 text-xs font-bold capitalize transition-all duration-300 ${
                            previewLayout === layout
                              ? 'bg-gradient-to-r from-slate-700 to-slate-800 text-white shadow-inner'
                              : 'bg-transparent text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {layout === 'edit' ? '編集' : layout === 'split' ? '分割' : 'プレビュー'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleInjectMarkdownSample}
                  className="text-xs font-bold border-2 border-dashed border-slate-300/80 rounded-2xl px-4 py-2 text-slate-600 hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition-all duration-300"
                >
                  Markdownテスト挿入
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)] gap-5 flex-1 min-h-0">
                {/* アウトライン: すべてのビューで常に表示・更新可能 - モダンなデザイン */}
                <div className="border-2 border-slate-200/60 rounded-2xl p-5 bg-gradient-to-br from-slate-50/90 via-indigo-50/20 to-purple-50/20 overflow-y-auto scrollable min-h-0 shadow-lg shadow-slate-200/30">
                  <h3 className="text-xs font-bold text-slate-700 mb-4 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-indigo-500 to-purple-500 rounded-full"></div>
                    Outline
                  </h3>
                <div className="space-y-1 text-sm text-gray-600">
                  {outlineSections.length > 0 ? (
                    outlineSections.map((item) => {
                      const isExpanded = expandedChapters.has(item.id)
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-1 group ${
                            dragOverSectionId === item.id ? 'bg-blue-50 rounded' : ''
                          }`}
                        >
                          <div
                            className={`flex-1 flex items-center gap-2 cursor-move hover:bg-white/80 px-4 py-2.5 rounded-xl transition-all duration-300 ${
                              item.level <= 1 ? 'pl-0' : item.level === 2 ? 'pl-6' : 'pl-12'
                            } ${dragOverSectionId === item.id ? 'bg-indigo-100/70 border-2 border-indigo-400 shadow-md' : ''}`}
                            draggable
                            onDragStart={(e) => {
                              setDraggingSectionId(item.id)
                              e.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.dataTransfer.dropEffect = 'move'
                              if (draggingSectionId && draggingSectionId !== item.id) {
                                setDragOverSectionId(item.id)
                              }
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (draggingSectionId && draggingSectionId !== item.id) {
                                handleReorderSection(draggingSectionId, item.id)
                              }
                              setDragOverSectionId(null)
                              setDraggingSectionId(null)
                            }}
                            onDragEnd={() => {
                              setDragOverSectionId(null)
                              setDraggingSectionId(null)
                            }}
                            onDragLeave={() => {
                              if (dragOverSectionId === item.id) {
                                setDragOverSectionId(null)
                              }
                            }}
                            onClick={() => {
                              // ドラッグ中でない場合のみトグル
                              if (!draggingSectionId) {
                                toggleChapter(item.id)
                              }
                            }}
                          >
                            <span className="text-sm font-semibold text-slate-700">{item.text}</span>
                            {isExpanded && (
                              <span className="text-xs text-indigo-500 ml-1 font-bold">▼</span>
                            )}
                            {!isExpanded && (
                              <span className="text-xs text-slate-400 ml-1">▶</span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-sm text-slate-400 font-medium">アウトラインはまだありません。</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="border-2 border-slate-200/60 rounded-2xl p-6 overflow-y-auto scrollable bg-white/90 backdrop-blur-sm shadow-lg shadow-slate-200/30" style={{ height: 'calc(100vh - 280px)', minHeight: '400px' }}>
                {selectedScenario ? (
                  viewMode === null ? (
                    <div className="relative h-full min-h-[400px] flex items-center justify-center bg-white">
                      <div className="absolute left-6 bottom-16 w-2/3 border-t border-dashed border-gray-300 rotate-[-12deg]" />
                      <span className="text-lg font-semibold text-gray-600 bg-white px-3 py-1 shadow-sm rounded">
                        Main Editor
                      </span>
                    </div>
                  ) : viewMode === 'outline' ? (
                    <div className="h-full flex flex-col" style={{ height: '100%' }}>
                      {outlineSections.length > 0 ? (
                        <div className="flex-1 space-y-4">
                          {outlineSections.map((item, index) => {
                            return (
                              <div
                                key={`outline-main-${item.id}-${index}`}
                                className={`flex flex-col border-2 rounded-2xl p-5 hover:border-indigo-300/50 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300 cursor-move bg-white/90 backdrop-blur-sm transform hover:scale-[1.01] ${
                                  dragOverSectionId === item.id ? 'border-indigo-400 bg-gradient-to-br from-indigo-50/80 to-purple-50/50 shadow-2xl shadow-indigo-400/30 scale-[1.02]' : 'border-slate-200/80'
                                }`}
                                draggable
                                onDragStart={() => setDraggingSectionId(item.id)}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  if (draggingSectionId && draggingSectionId !== item.id) {
                                    setDragOverSectionId(item.id)
                                  }
                                }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  if (draggingSectionId && draggingSectionId !== item.id) {
                                    handleReorderSection(draggingSectionId, item.id)
                                  }
                                  setDragOverSectionId(null)
                                  setDraggingSectionId(null)
                                }}
                                onDragEnd={() => {
                                  setDragOverSectionId(null)
                                  setDraggingSectionId(null)
                                }}
                                onDragLeave={() => {
                                  if (dragOverSectionId === item.id) {
                                    setDragOverSectionId(null)
                                  }
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-500 px-3 py-1.5 rounded-xl shadow-md shadow-indigo-500/30">
                                      {index + 1}章
                                    </span>
                                    <span className="font-bold text-slate-800 text-base">{item.text}</span>
                                  </div>
                                </div>
                                <p className="text-xs text-slate-500 mt-3 font-semibold flex items-center gap-2">
                                  <span className="px-2 py-0.5 bg-slate-100 rounded-md">レベル: {item.level}</span>
                                  <span className="px-2 py-0.5 bg-slate-100 rounded-md">開始行: {item.startLine + 1}</span>
                                </p>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center text-sm text-slate-400 italic">
                          アウトラインはまだありません
                        </div>
                      )}
                    </div>
                  ) : viewMode === 'plain' ? (
                    <div className="h-full flex flex-col" style={{ height: '100%' }}>
                      <textarea
                        value={toPlainText(editorContent)}
                        onChange={(e) => {
                          // #記号を削除したプレーンテキストを取得
                          const plainWithoutHash = removeHashSymbols(e.target.value)
                          // PlainテキストからMarkdownに変換
                          const markdown = fromPlainText(plainWithoutHash)
                          handleContentChange(markdown)
                        }}
                        className="w-full h-full text-sm leading-relaxed text-slate-800 font-sans resize-none border-2 border-slate-200/80 rounded-xl p-4 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 scrollable whitespace-pre-wrap"
                        placeholder="ここにプレーンテキストで内容を編集できます..."
                        aria-label="プレーンモード編集"
                      />
                    </div>
                  ) : viewMode === 'preview' ? (
                    <div className="h-full flex flex-col" style={{ height: '100%' }}>
                      <div
                        key={`preview-${selectedScenarioId || 'none'}`}
                        ref={previewContainerRef}
                        contentEditable
                        suppressContentEditableWarning
                        onBlur={(e) => {
                          const target = e.currentTarget
                          // HTMLからテキストを抽出し、基本的なmarkdown変換を行う
                          const extractMarkdown = (el: HTMLElement): string => {
                            let result = ''
                            el.childNodes.forEach((node) => {
                              if (node.nodeType === Node.TEXT_NODE) {
                                result += node.textContent || ''
                              } else if (node.nodeType === Node.ELEMENT_NODE) {
                                const elem = node as HTMLElement
                                const tag = elem.tagName.toLowerCase()
                                const inner = extractMarkdown(elem)
                                if (tag === 'h1') result += `# ${inner}\n\n`
                                else if (tag === 'h2') result += `## ${inner}\n\n`
                                else if (tag === 'h3') result += `### ${inner}\n\n`
                                else if (tag === 'h4') result += `#### ${inner}\n\n`
                                else if (tag === 'p') result += `${inner}\n\n`
                                else if (tag === 'li') result += `- ${inner}\n`
                                else if (tag === 'ul' || tag === 'ol') result += inner
                                else if (tag === 'blockquote') result += `> ${inner}\n\n`
                                else if (tag === 'strong' || tag === 'b') result += `**${inner}**`
                                else if (tag === 'em' || tag === 'i') result += `*${inner}*`
                                else if (tag === 'code') result += `\`${inner}\``
                                else if (tag === 'br') result += '\n'
                                else if (tag === 'div') result += `${inner}\n`
                                else result += inner
                              }
                            })
                            return result
                          }
                          const newContent = extractMarkdown(target).trim()
                          handleContentChange(newContent)
                        }}
                        className="h-full border-2 border-slate-200/80 rounded-xl p-4 overflow-y-auto scrollable bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 cursor-text markdown-preview"
                        aria-label="プレビューモード編集"
                        dangerouslySetInnerHTML={{ __html: dictionaryHighlightedMarkdown }}
                      />
                    </div>
                  ) : viewMode === 'markdown' ? (
                    <div className="h-full flex flex-col" style={{ height: '100%' }}>
                      {previewLayout === 'split' ? (
                        <div className="grid md:grid-cols-2 gap-4 h-full">
                          <textarea
                            value={editorContent}
                            onChange={(e) => handleContentChange(e.target.value)}
                            className="w-full h-full text-sm leading-relaxed text-slate-700 font-mono resize-none border-2 border-slate-200 rounded-xl p-4 bg-white/90 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all duration-200 scrollable"
                            placeholder="ここにMarkdown形式で内容を入力してください..."
                          />
                          <div className="border-2 border-slate-200 rounded-xl p-4 overflow-y-auto scrollable bg-white/90 h-full">
                            <div
                              className="markdown-preview"
                              dangerouslySetInnerHTML={{ __html: dictionaryHighlightedMarkdown }}
                            />
                          </div>
                        </div>
                      ) : previewLayout === 'preview' ? (
                        <div className="h-full border-2 border-slate-200 rounded-xl p-4 overflow-y-auto scrollable bg-white/90">
                          <div
                            className="markdown-preview"
                            dangerouslySetInnerHTML={{ __html: dictionaryHighlightedMarkdown }}
                          />
                        </div>
                      ) : (
                        <textarea
                          value={editorContent}
                          onChange={(e) => handleContentChange(e.target.value)}
                          className="w-full h-full text-sm leading-relaxed text-slate-700 font-mono resize-none border-none outline-none bg-transparent scrollable"
                          placeholder="ここにMarkdown形式で内容を入力してください..."
                        />
                      )}
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700 font-mono">
                      {editorContent}
                    </div>
                  )
                ) : (
                  <div className="h-full flex flex-col items-center justify-center py-16">
                    <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-6 shadow-lg shadow-indigo-200/50">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-xl shadow-indigo-500/30">
                        <Plus className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <p className="text-base font-bold text-slate-600 mb-2">プロジェクトを選択してください</p>
                    <p className="text-sm text-slate-400">左側のプロジェクト一覧から選択すると内容が表示されます</p>
                  </div>
                )}
              </div>
            </div>
            </div>
          </section>

          {/* Action Panel / Tag Manager / Dictionary Manager / Proofread Mode */}
          {showProofreadMode ? (
            <aside className="bg-white/90 backdrop-blur-md border border-slate-200/60 rounded-2xl p-5 flex flex-col space-y-3 shadow-lg shadow-slate-200/50 min-h-0">
              <div className="flex items-center justify-between border-b-2 border-slate-200/60 pb-3 mb-3">
                <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase">校正モード</h3>
                <button
                  onClick={() => setShowProofreadMode(false)}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                  aria-label="校正モードを閉じる"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Custom Panels */}
              <div className="flex-1 overflow-y-auto scrollable space-y-3 min-h-0">
                {customPanels.map((panel) => (
                  <div key={panel.id} className="border-2 border-slate-200/60 rounded-xl bg-gradient-to-br from-white/90 to-slate-50/50 shadow-md">
                    <div className="flex items-center justify-between px-4 py-3 border-b-2 border-slate-200/60 bg-slate-50/50 rounded-t-xl">
                      <input
                        type="text"
                        value={panel.title}
                        onChange={(e) => handleUpdatePanelTitle(panel.id, e.target.value)}
                        className="text-xs font-bold text-slate-700 bg-transparent border-none outline-none focus:bg-white px-2 py-1 rounded-lg tracking-wider uppercase"
                        onBlur={(e) => {
                          if (!e.target.value.trim()) {
                            handleUpdatePanelTitle(panel.id, '新しいパネル')
                          }
                        }}
                      />
                      <button
                        onClick={() => handleRemovePanel(panel.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg p-1 transition-all duration-200"
                        aria-label="閉じる"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-4 py-3 min-h-[80px]">
                      <textarea
                        value={panel.content}
                        onChange={(e) => {
                          setCustomPanels(customPanels.map(p => 
                            p.id === panel.id ? { ...p, content: e.target.value } : p
                          ))
                        }}
                        className="w-full text-sm text-slate-700 border-none outline-none resize-none bg-transparent placeholder-slate-400"
                        placeholder="内容を入力..."
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons Grid - モダンなデザイン */}
              <div className="grid grid-cols-2 gap-3 mt-auto pt-5 border-t-2 border-slate-200/60">
                <button 
                  onClick={handleAddArticle}
                  className="border-2 border-slate-200/80 bg-white/90 rounded-2xl px-4 py-3 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-indigo-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 group"
                >
                  <span className="group-hover:text-indigo-600 transition-colors duration-300">＋ 文章の追加</span>
                </button>
                <button 
                  onClick={handleAddDictionary}
                  className="border-2 border-slate-200/80 bg-white/90 rounded-2xl px-4 py-3 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-pink-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 group"
                >
                  <span className="group-hover:text-pink-600 transition-colors duration-300">＋ 辞書の追加</span>
                </button>
                <button 
                  onClick={handleProofreadRange}
                  className="border-2 border-slate-200/80 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl px-4 py-3 text-sm font-bold text-left text-slate-700 hover:from-emerald-500/20 hover:to-teal-500/20 hover:border-emerald-300/50 hover:shadow-xl hover:shadow-emerald-200/50 hover:scale-[1.02] transition-all duration-300 flex items-center justify-between group"
                >
                  <span className="group-hover:text-emerald-600 transition-colors duration-300">範囲を校正</span>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 group-hover:text-emerald-600 transition-all duration-300" />
                </button>
              </div>
            </aside>
          ) : showDictionaryManager ? (
            <aside className="bg-white/95 backdrop-blur-xl border-2 border-slate-200/60 rounded-3xl p-6 flex flex-col space-y-4 shadow-2xl shadow-slate-300/30 min-h-0 overflow-y-auto scrollable relative overflow-hidden">
              {/* 装飾的なグラデーション */}
              <div className="absolute top-0 left-0 w-40 h-40 bg-gradient-to-br from-blue-400/10 to-cyan-400/10 rounded-full blur-2xl -ml-20 -mt-20"></div>
              
              <div className="relative z-10">
                {/* あらすじ Window - モダンなデザイン */}
                <div className="border-2 border-slate-200/60 rounded-2xl bg-gradient-to-br from-white/95 to-blue-50/30 shadow-xl shadow-slate-200/30 mb-4">
                  <div className="flex items-center justify-between px-5 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-blue-50/50 to-cyan-50/30 rounded-t-2xl">
                    <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase flex items-center gap-2">
                      <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-cyan-500 rounded-full"></div>
                      あらすじ
                    </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCloseDictionaryManager}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                      aria-label="最小化"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleCloseDictionaryManager}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                      aria-label="閉じる"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3 min-h-[80px]">
                  <textarea
                    className="w-full text-sm text-slate-700 border-none outline-none resize-none bg-transparent placeholder-slate-400"
                    placeholder="あらすじを入力..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Note Window - モダンなデザイン */}
              <div className="border-2 border-slate-200/60 rounded-2xl bg-gradient-to-br from-white/95 to-emerald-50/30 shadow-xl shadow-slate-200/30 mb-4">
                <div className="flex items-center justify-between px-5 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-emerald-50/50 to-teal-50/30 rounded-t-2xl">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full"></div>
                    Note
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCloseDictionaryManager}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                      aria-label="最小化"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleCloseDictionaryManager}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                      aria-label="閉じる"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="px-4 py-3 min-h-[80px]">
                  <textarea
                    className="w-full text-sm text-slate-700 border-none outline-none resize-none bg-transparent placeholder-slate-400"
                    placeholder="ノートを入力..."
                    rows={3}
                  />
                </div>
              </div>

              {/* タグ Window - モダンなデザイン */}
              <div className="border-2 border-slate-200/60 rounded-2xl bg-gradient-to-br from-white/95 to-amber-50/30 shadow-xl shadow-slate-200/30 mb-4">
                <div className="flex items-center justify-between px-5 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-amber-50/50 to-orange-50/30 rounded-t-2xl">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wider uppercase flex items-center gap-2">
                    <div className="w-1 h-4 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full"></div>
                    タグ
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCloseDictionaryManager}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                      aria-label="最小化"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <button
                      onClick={handleCloseDictionaryManager}
                      className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1 transition-all duration-200"
                      aria-label="閉じる"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-slate-700">タグ</span>
                  <button className="px-4 py-2 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 hover:from-amber-600 hover:via-orange-600 hover:to-red-600 rounded-xl text-sm font-bold text-white shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 hover:scale-105 transition-all duration-300">
                    Main
                  </button>
                  <button className="px-4 py-2 border-2 border-slate-200/80 hover:border-indigo-300/50 hover:bg-indigo-50/50 rounded-xl text-sm font-bold text-slate-600 hover:text-indigo-600 transition-all duration-300 hover:scale-105">
                    +説明を追加
                  </button>
                </div>
              </div>

              {/* 辞書 Windows - モダンなデザイン */}
              {dictionaryItems.map((item) => (
                <div key={item.id} className="border-2 border-slate-200/60 rounded-2xl bg-gradient-to-br from-white/95 to-blue-50/40 shadow-xl shadow-slate-200/30 mb-4 transform hover:scale-[1.01] transition-all duration-300">
                  <div className="flex items-center justify-between px-5 py-4 border-b-2 border-slate-200/60 bg-gradient-to-r from-blue-50/60 via-indigo-50/40 to-purple-50/30 rounded-t-2xl">
                    <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                      <div className="w-1.5 h-5 bg-gradient-to-b from-blue-500 to-indigo-500 rounded-full"></div>
                      {item.term}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEditDictionaryEntry(item)}
                        className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-xl transition-all duration-300 hover:scale-105"
                        aria-label="辞書エントリを編集"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleRemoveDictionaryEntry(item.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl p-1.5 transition-all duration-300 hover:scale-110"
                        aria-label="辞書エントリを削除"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="px-5 py-4">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-medium mb-3">{item.description}</p>
                    <div className="flex items-center gap-2 pt-3 border-t border-slate-200/50">
                      <span className="text-xs text-slate-500 font-semibold">
                        登録日: {item.createdAt ? new Date(item.createdAt).toLocaleDateString('ja-JP') : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Action Buttons Grid - モダンなデザイン */}
              <div className="grid grid-cols-2 gap-3 mt-auto pt-5 border-t-2 border-slate-200/60">
                <button 
                  onClick={handleAddArticle}
                  className="border-2 border-slate-200/80 bg-white/90 rounded-2xl px-4 py-3 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-indigo-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 group"
                >
                  <span className="group-hover:text-indigo-600 transition-colors duration-300">＋ 文章の追加</span>
                </button>
                <button 
                  onClick={handleAddDictionary}
                  className="border-2 border-slate-200/80 bg-white/90 rounded-2xl px-4 py-3 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-pink-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 group"
                >
                  <span className="group-hover:text-pink-600 transition-colors duration-300">＋ 辞書の追加</span>
                </button>
                <button 
                  onClick={handleProofreadRange}
                  className="border-2 border-slate-200/80 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl px-4 py-3 text-sm font-bold text-left text-slate-700 hover:from-emerald-500/20 hover:to-teal-500/20 hover:border-emerald-300/50 hover:shadow-xl hover:shadow-emerald-200/50 hover:scale-[1.02] transition-all duration-300 flex items-center justify-between group"
                >
                  <span className="group-hover:text-emerald-600 transition-colors duration-300">範囲を校正</span>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 group-hover:text-emerald-600 transition-all duration-300" />
                </button>
              </div>
              </div>
            </aside>
          ) : (
          <aside className="bg-white/95 backdrop-blur-xl border-2 border-slate-200/60 rounded-3xl p-6 flex flex-col space-y-4 shadow-2xl shadow-slate-300/30 min-h-0 relative overflow-hidden">
              {/* 装飾的なグラデーション */}
              <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-pink-400/10 to-rose-400/10 rounded-full blur-2xl -ml-16 -mt-16"></div>
              
              <div className="relative z-10 flex flex-col space-y-4">
              <button 
                  onClick={handleAddArticle}
                  className="w-full border-2 border-slate-200/80 bg-white/90 rounded-2xl px-5 py-4 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-indigo-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 group"
                >
                  <span className="group-hover:text-indigo-600 transition-colors duration-300">＋ 文章の追加</span>
                </button>
                <button 
                  onClick={handleAddDictionary}
                  className="w-full border-2 border-slate-200/80 bg-white/90 rounded-2xl px-5 py-4 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-pink-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 group"
                >
                  <span className="group-hover:text-pink-600 transition-colors duration-300">＋ 辞書の追加</span>
                </button>
                <button 
                  onClick={handleSearchMaterials}
                  className="w-full border-2 border-slate-200/80 bg-white/90 rounded-2xl px-5 py-4 text-sm font-bold text-left text-slate-700 hover:bg-white hover:border-teal-300/50 hover:shadow-xl hover:shadow-slate-200/50 hover:scale-[1.02] transition-all duration-300 flex items-center group"
                >
                  <Plus className="h-4 w-4 mr-2 group-hover:text-teal-600 transition-colors duration-300" />
                  <span className="group-hover:text-teal-600 transition-colors duration-300">資料の検索</span>
                </button>
                <button 
                  onClick={handleProofreadRange}
                  className="w-full border-2 border-slate-200/80 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 rounded-2xl px-5 py-4 text-sm font-bold text-left text-slate-700 hover:from-emerald-500/20 hover:to-teal-500/20 hover:border-emerald-300/50 hover:shadow-xl hover:shadow-emerald-200/50 hover:scale-[1.02] transition-all duration-300 flex items-center justify-between group"
                >
                  <span className="group-hover:text-emerald-600 transition-colors duration-300">範囲を校正</span>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 group-hover:text-emerald-600 transition-all duration-300" />
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
      />

      {/* Prompt Input Modal */}
      <PromptInputModal
        isOpen={isPromptInputOpen}
        onClose={() => setIsPromptInputOpen(false)}
        onSave={handleSavePromptText}
        onNext={handleGenerateText}
      />

      {/* Dictionary Input Modal */}
      <DictionaryInputModal
        isOpen={isDictionaryInputOpen}
        onClose={() => {
          setIsDictionaryInputOpen(false)
          setEditingDictionaryEntry(null)
        }}
        onSave={handleDictionaryModalSave}
        onNext={editingDictionaryEntry ? undefined : handleAddDictionaryItem}
        mode={editingDictionaryEntry ? 'edit' : 'create'}
        initialEntry={
          editingDictionaryEntry
            ? { term: editingDictionaryEntry.term, description: editingDictionaryEntry.description }
            : undefined
        }
      />
    </div>
  )
}

export default DashboardPage
