'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Image as ImageIcon, Loader2, AlertCircle, History as HistoryIcon, X } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface AnalysisResult {
  whatISee: string
  whatThisMeans: string
  possibleIssues: string
  whatYouCanDoNext: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  raw?: string
  // backend bazen result döndürüyor; sorun değil
  result?: string
  error?: string
}

type AnalysisMode = 'kitchen' | 'warehouse' | 'office'

const ANALYSIS_MODES = {
  kitchen: 'Kitchen / Food Safety',
  warehouse: 'Warehouse / Storage',
  office: 'Office Safety',
} as const

type HistoryItem = {
  id: string
  createdAt: number
  mode: AnalysisMode
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  whatISee: string
  whatThisMeans: string
  possibleIssues: string
  whatYouCanDoNext: string
  raw?: string
  imageDataUrl?: string // preview için
}

const HISTORY_KEY = 'wi_history_v1'
const DAILY_KEY = 'wi_daily_usage_v1'
const DAILY_FREE_LIMIT = 2
const HISTORY_LIMIT = 20

function todayKey() {
  // local tarih bazlı (client)
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function safeParse<T>(s: string | null, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export default function ExplainMyScreenshot() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)

  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('kitchen')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [history, setHistory] = useState<HistoryItem[]>([])
  const [activeTab, setActiveTab] = useState<'analyze' | 'history'>('analyze')
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [dailyCount, setDailyCount] = useState(0)

  // Load history + daily usage on mount
  useEffect(() => {
    const h = safeParse<HistoryItem[]>(localStorage.getItem(HISTORY_KEY), [])
    setHistory(Array.isArray(h) ? h : [])

    const usage = safeParse<{ date: string; count: number }>(localStorage.getItem(DAILY_KEY), {
      date: todayKey(),
      count: 0,
    })
    if (usage.date !== todayKey()) {
      const reset = { date: todayKey(), count: 0 }
      localStorage.setItem(DAILY_KEY, JSON.stringify(reset))
      setDailyCount(0)
    } else {
      setDailyCount(usage.count || 0)
    }
  }, [])

  const remainingToday = useMemo(() => Math.max(0, DAILY_FREE_LIMIT - dailyCount), [dailyCount])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB')
        return
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please upload a valid image file (PNG, JPG, etc.)')
        return
      }

      setSelectedFile(file)
      const url = URL.createObjectURL(file)
      setPreviewUrl(url)
      setError(null)
      setAnalysis(null)

      // Convert to dataURL for history preview
      const reader = new FileReader()
      reader.onload = () => setImageDataUrl(String(reader.result || ''))
      reader.onerror = () => setImageDataUrl(null)
      reader.readAsDataURL(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
    },
    multiple: false,
  })

  const bumpDailyUsage = () => {
    const t = todayKey()
    const current = safeParse<{ date: string; count: number }>(localStorage.getItem(DAILY_KEY), {
      date: t,
      count: 0,
    })

    const next =
      current.date === t
        ? { date: t, count: (current.count || 0) + 1 }
        : { date: t, count: 1 }

    localStorage.setItem(DAILY_KEY, JSON.stringify(next))
    setDailyCount(next.count)
  }

  const saveToHistory = (result: AnalysisResult) => {
    // Eğer backend "not applicable" gibi dönmüşse de history’e kaydetmek isteyebilirsin.
    // Ben kaydediyorum çünkü kullanıcı “ne oldu” diye geri bakabilir.
    const item: HistoryItem = {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      mode: analysisMode,
      riskLevel: result.riskLevel,
      whatISee: result.whatISee || '',
      whatThisMeans: result.whatThisMeans || '',
      possibleIssues: result.possibleIssues || '',
      whatYouCanDoNext: result.whatYouCanDoNext || '',
      raw: result.raw,
      imageDataUrl: imageDataUrl || undefined,
    }

    const next = [item, ...history].slice(0, HISTORY_LIMIT)
    setHistory(next)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return

    // Daily limit gate
    if (dailyCount >= DAILY_FREE_LIMIT) {
      setShowUpgrade(true)
      return
    }

    setIsAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', selectedFile)
      formData.append('mode', analysisMode)

      const response = await fetch('/api/explain-screenshot', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.error || 'Failed to analyze screenshot')
      }

      // If backend returns an error field but 200, show it
      if (result?.error && !result?.riskLevel) {
        setError(String(result.error))
      }

      setAnalysis(result)
      bumpDailyUsage()
      saveToHistory(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const downloadPdf = async () => {
    const el = document.getElementById('analysis-results')
    if (!el) return

    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    })

    const imgData = canvas.toDataURL('image/png')

    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width

    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 6

    // If taller than one page, add pages
    let position = margin
    let heightLeft = pdfHeight

    pdf.addImage(imgData, 'PNG', margin, position, pdfWidth - margin * 2, pdfHeight)
    heightLeft -= pageHeight

    while (heightLeft > 0) {
      pdf.addPage()
      position = heightLeft - pdfHeight + margin
      pdf.addImage(imgData, 'PNG', margin, position, pdfWidth - margin * 2, pdfHeight)
      heightLeft -= pageHeight
    }

    pdf.save(`workplace-report-${Date.now()}.pdf`)
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW':
        return 'text-green-600 bg-green-50'
      case 'MEDIUM':
        return 'text-yellow-600 bg-yellow-50'
      case 'HIGH':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const formatDate = (ts: number) => {
    const d = new Date(ts)
    return d.toLocaleString()
  }

  const openHistoryItem = (item: HistoryItem) => {
    setActiveTab('analyze')
    setAnalysisMode(item.mode)
    setAnalysis({
      whatISee: item.whatISee,
      whatThisMeans: item.whatThisMeans,
      possibleIssues: item.possibleIssues,
      whatYouCanDoNext: item.whatYouCanDoNext,
      riskLevel: item.riskLevel,
      raw: item.raw,
    })
    setPreviewUrl(item.imageDataUrl || null)
    setImageDataUrl(item.imageDataUrl || null)
    setError(null)
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem(HISTORY_KEY)
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold mb-2">Workplace Inspector</h1>
        <p className="text-muted-foreground">Upload workplace photos for AI-powered safety analysis</p>
      </div>

      {/* Top bar: tabs + daily usage */}
      <div className="flex items-center justify-between mb-6 gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'analyze' ? 'default' : 'outline'}
            onClick={() => setActiveTab('analyze')}
          >
            Analyze
          </Button>
          <Button
            variant={activeTab === 'history' ? 'default' : 'outline'}
            onClick={() => setActiveTab('history')}
          >
            <HistoryIcon className="mr-2 h-4 w-4" />
            History
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          Free today: <span className="font-medium">{dailyCount}</span> / {DAILY_FREE_LIMIT} used
          {remainingToday > 0 ? (
            <span className="ml-2">({remainingToday} left)</span>
          ) : (
            <span className="ml-2 text-red-600">(limit reached)</span>
          )}
        </div>
      </div>

      {activeTab === 'history' ? (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Last {HISTORY_LIMIT} analyses stored on this device</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.length === 0 ? (
              <div className="text-sm text-muted-foreground">No history yet.</div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Click an item to reopen it on the Analyze tab.
                  </div>
                  <Button variant="outline" onClick={clearHistory}>
                    Clear history
                  </Button>
                </div>

                <div className="grid gap-3">
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="border rounded-lg p-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-muted/40"
                      onClick={() => openHistoryItem(h)}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRiskColor(h.riskLevel)}`}>
                            {h.riskLevel}
                          </span>
                          <span className="text-sm font-medium">{ANALYSIS_MODES[h.mode]}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{formatDate(h.createdAt)}</div>
                        <div className="text-sm mt-2 line-clamp-2 text-muted-foreground">
                          {h.whatThisMeans || h.whatISee || '—'}
                        </div>
                      </div>

                      {h.imageDataUrl ? (
                        <img
                          src={h.imageDataUrl}
                          alt="thumb"
                          className="h-14 w-14 rounded-md object-cover border"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-md border flex items-center justify-center text-xs text-muted-foreground">
                          no img
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upload Section */}
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Upload Workplace Photo</CardTitle>
              <CardDescription>Drag and drop or click to select an image (PNG, JPG - Max 10MB)</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Analysis Mode Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Analysis Mode</label>
                <Select value={analysisMode} onValueChange={(value: AnalysisMode) => setAnalysisMode(value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select analysis mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ANALYSIS_MODES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                }`}
              >
                <input {...getInputProps()} />
                {previewUrl ? (
                  <div className="space-y-4">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-w-full max-h-64 mx-auto rounded-lg shadow-sm"
                    />
                    <p className="text-sm text-muted-foreground">
                      {selectedFile?.name
                        ? `${selectedFile.name} (${(((selectedFile.size || 0) / 1024) / 1024).toFixed(2)} MB)`
                        : 'Preview loaded'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                    <div>
                      <p className="text-lg font-medium">{isDragActive ? 'Drop the image here' : 'Drag & drop an image here'}</p>
                      <p className="text-sm text-muted-foreground">or click to select from your computer</p>
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {selectedFile && (
                <div className="mt-4 flex justify-center">
                  <Button onClick={handleAnalyze} disabled={isAnalyzing} size="lg">
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        Analyze Workplace
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Analysis Results */}
          {analysis && (
            <div id="analysis-results" className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-bold">Analysis Results</h2>

                <div className="flex items-center gap-2">
                  {/* PDF is FREE */}
                  <Button variant="outline" onClick={downloadPdf}>
                    Download PDF
                  </Button>

                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(analysis.riskLevel)}`}>
                    Risk Level: {analysis.riskLevel}
                  </span>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">What I See</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.whatISee}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">What This Means</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.whatThisMeans}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Possible Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.possibleIssues}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">What You Can Do Next</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.whatYouCanDoNext}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upgrade Modal */}
      {showUpgrade && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <div className="font-semibold">Upgrade to Pro</div>
                <div className="text-sm text-muted-foreground">You reached today’s free limit.</div>
              </div>
              <button
                onClick={() => setShowUpgrade(false)}
                className="p-2 rounded hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div className="text-sm">
                Free plan includes <b>{DAILY_FREE_LIMIT}</b> analyses per day.
              </div>

              <div className="border rounded-lg p-3 text-sm space-y-2">
                <div className="font-medium">Pro unlocks:</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Unlimited analyses</li>
                  <li>Saved history across sessions (later: cloud account)</li>
                  <li>Team & multiple locations (Business)</li>
                </ul>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowUpgrade(false)}>
                  Not now
                </Button>
                {/* Stripe later — şimdilik buton placeholder */}
                <Button
                  onClick={() => {
                    alert('Stripe next step. For now, this is a placeholder.')
                    setShowUpgrade(false)
                  }}
                >
                  Upgrade (coming soon)
                </Button>
              </div>

              <div className="text-xs text-muted-foreground">
                Note: Your history is currently stored on this device (localStorage). Cloud accounts come next.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
