'use client'

import { Editor } from '@monaco-editor/react'
import { useState } from 'react'

interface TestResult {
  case: number
  passed: boolean
  input: string
  expected: string
  actual?: string
}

interface CodeEditorProps {
  sessionId: string
  onCodeChange?: (code: string) => void
  onRunCode?: (code: string) => void
}

const STARTER_CODE = `def twoSum(nums: list[int], target: int) -> list[int]:
    """
    Given an array of integers nums and an integer target,
    return indices of the two numbers that add up to target.
    """
    # Write your solution here
    pass
`

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function CodeEditor({ sessionId, onCodeChange, onRunCode }: CodeEditorProps) {
  const [code, setCode] = useState(STARTER_CODE)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value)
      onCodeChange?.(value)
    }
  }

  const handleRunCode = async () => {
    setIsRunning(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/interviews/${sessionId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`)
      }

      const data = await response.json()

      // Transform backend response to TestResult format
      const results: TestResult[] = []
      const totalTests = data.total || 0
      const passedCount = data.passed || 0
      const details = data.details || []

      // Add passed tests (we don't have individual details for passed tests)
      for (let i = 1; i <= totalTests; i++) {
        const failedDetail = details.find((d: { case: number }) => d.case === i)
        if (failedDetail) {
          results.push({
            case: i,
            passed: false,
            input: JSON.stringify(failedDetail.input),
            expected: JSON.stringify(failedDetail.expected),
            actual: failedDetail.error || JSON.stringify(failedDetail.actual),
          })
        } else {
          results.push({
            case: i,
            passed: true,
            input: `Test case ${i}`,
            expected: 'Passed',
          })
        }
      }

      // Handle stderr/execution errors
      if (data.stderr) {
        setError(data.stderr)
      }

      setTestResults(results)
      onRunCode?.(code)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run code')
    } finally {
      setIsRunning(false)
    }
  }

  const passedTests = testResults?.filter(r => r.passed).length ?? 0
  const totalTests = testResults?.length ?? 0

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
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
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Running...
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
            suggest: { enabled: false },
            inlineSuggest: { enabled: false },
            hover: { enabled: false },
            codeLens: false,
            contextmenu: false,
            snippetSuggestions: 'none',
            links: false,
          }}
        />
      </div>

      {/* Test Results Panel */}
      {testResults && (
        <div className="flex-shrink-0 border-t border-[#3c3c3c] bg-[#1e1e1e] max-h-48 overflow-y-auto">
          <div className="px-4 py-2 border-b border-[#3c3c3c] flex items-center justify-between">
            <span className="text-sm text-[#cccccc]">Test Results</span>
            <span className={`text-sm font-mono ${
              passedTests === totalTests ? 'text-[#4ec9b0]' : 'text-[#ce9178]'
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
