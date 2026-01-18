'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Upload, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

interface AnalysisResult {
  whatISee: string
  whatThisMeans: string
  possibleIssues: string
  whatYouCanDoNext: string
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  raw?: string
}

type AnalysisMode = 'kitchen' | 'warehouse' | 'office'

const ANALYSIS_MODES = {
  kitchen: 'Kitchen / Food Safety',
  warehouse: 'Warehouse / Storage',
  office: 'Office Safety'
} as const

export default function ExplainMyScreenshot() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('kitchen')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setPreviewUrl(URL.createObjectURL(file))
      setError(null)
      setAnalysis(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    },
    multiple: false
  })

  const handleAnalyze = async () => {
    if (!selectedFile) return

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

      if (!response.ok) {
        throw new Error('Failed to analyze screenshot')
      }

      const result = await response.json()
      setAnalysis(result)
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

    const maxHeight = pdf.internal.pageSize.getHeight() - 10
    const finalHeight = Math.min(pdfHeight, maxHeight)

    pdf.addImage(imgData, 'PNG', 5, 5, pdfWidth - 10, finalHeight)
    pdf.save(`workplace-report-${Date.now()}.pdf`)
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'LOW': return 'text-green-600 bg-green-50'
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-50'
      case 'HIGH': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Workplace Inspector</h1>
        <p className="text-muted-foreground">
          Upload workplace photos for AI-powered safety analysis
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Upload Workplace Photo</CardTitle>
          <CardDescription>
            Drag and drop or click to select an image (PNG, JPG - Max 10MB)
          </CardDescription>
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
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-primary/50'
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
                  {selectedFile?.name} ({(((selectedFile?.size || 0) / 1024) / 1024).toFixed(2)} MB)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">
                    {isDragActive ? 'Drop the image here' : 'Drag & drop an image here'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to select from your computer
                  </p>
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
              <Button
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                size="lg"
              >
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
                <p className="text-sm leading-relaxed">{analysis.whatISee}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What This Means</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{analysis.whatThisMeans}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Possible Issues</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{analysis.possibleIssues}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What You Can Do Next</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">{analysis.whatYouCanDoNext}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
