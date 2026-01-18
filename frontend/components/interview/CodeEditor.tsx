'use client'

import { Editor, loader } from '@monaco-editor/react'
import { useState, useEffect } from 'react'

// Configure Monaco loader to use usage unpkg to avoid source map 404s
loader.config({
  paths: {
    vs: 'https://unpkg.com/monaco-editor@0.55.1/min/vs',
  },
})

interface TestResult {
  case: number
  passed: boolean
  input: string
  expected: string
  actual?: string
}

interface CodeEditorProps {
  initialCode?: string
  onCodeChange?: (code: string) => void
  onRunCode?: (code: string) => Promise<{ results: Array<{ case: number; passed: boolean; input: string; expected: string; actual?: string }>; all_passed: boolean; execution_time_ms: number } | void>
}

const STARTER_CODE = `def twoSum(nums: list[int], target: int) -> list[int]:
    """
    Given an array of integers nums and an integer target,
    return indices of the two numbers that add up to target.
    """
    # Write your solution here
    pass
`

export default function CodeEditor({ initialCode, onCodeChange, onRunCode }: CodeEditorProps) {
  const [code, setCode] = useState(initialCode || STARTER_CODE)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Expose current code globally for AI to access
  useEffect(() => {
    (window as any).__areteCurrentCode = code
    return () => {
      delete (window as any).__areteCurrentCode
    }
  }, [code])

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value)
      onCodeChange?.(value)
    }
  }

  const handleRunCode = async () => {
    if (!onRunCode) return

    setIsRunning(true)
    setError(null)

    try {
      const result = await onRunCode(code)

      if (result && result.results) {
        setTestResults(result.results)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run code')
    } finally {
      setIsRunning(false)
    }
  }

  const passedTests = testResults?.filter(r => r.passed).length ?? 0
  const totalTests = testResults?.length ?? 0

  return (
    <div className="flex flex-col h-full min-h-0 bg-[#1e1e1e]">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#3c3c3c]">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#cccccc]">solution.py</span>
          <span className="text-xs text-[#6b6b6b]">Python 3.11</span>
        </div>

        <button
          onClick={handleRunCode}
          disabled={isRunning}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-[#0e639c] hover:bg-[#1177bb] text-white rounded transition-colors disabled:opacity-50"
        >
          {isRunning ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run Code
            </>
          )}
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language="python"
          value={code}
          onChange={handleCodeChange}
          theme="vs-dark"
          options={{
            fontSize: 14,
            fontFamily: "'IBM Plex Mono', 'Consolas', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'on',
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
            bracketPairColorization: { enabled: true },
            // Completely disable ALL autocomplete/suggestions
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            tabCompletion: 'off',
            wordBasedSuggestions: 'off',
            parameterHints: { enabled: false },
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            autoSurround: 'never',
            formatOnType: false,
            formatOnPaste: false,
            inlineSuggest: { enabled: false },
            hover: { enabled: false },
            codeLens: false,
            contextmenu: false,
            snippetSuggestions: 'none',
            links: false,
          }}
        />
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-[#f14c4c]/10 border-b border-[#f14c4c]/20 text-[#f14c4c] text-xs font-mono">
          Error: {error}
        </div>
      )}

      {/* Test Results Panel */}
      {testResults && (
        <div className="flex-shrink-0 border-t border-[#3c3c3c] bg-[#1e1e1e] max-h-48 overflow-y-auto">
          <div className="px-4 py-2 border-b border-[#3c3c3c] flex items-center justify-between">
            <span className="text-sm text-[#cccccc]">Test Results</span>
            <span className={`text-sm font-mono ${passedTests === totalTests ? 'text-[#4ec9b0]' : 'text-[#ce9178]'
              }`}>
              {passedTests}/{totalTests} passed
            </span>
          </div>

          <div className="divide-y divide-[#3c3c3c]">
            {testResults.map((result) => (
              <div key={result.case} className="px-4 py-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs ${result.passed ? 'text-[#4ec9b0]' : 'text-[#f14c4c]'}`}>
                    {result.passed ? '✓' : '✗'}
                  </span>
                  <span className="text-sm text-[#cccccc]">Test {result.case}</span>
                </div>
                <div className="text-xs text-[#6b6b6b] font-mono space-y-0.5">
                  <div>Input: {result.input}</div>
                  <div className="flex gap-4">
                    <span>Expected: {result.expected}</span>
                    {!result.passed && result.actual && (
                      <span className="text-[#f14c4c]">Got: {result.actual}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
